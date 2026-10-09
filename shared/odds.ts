// Season odds: play the rest of the season thousands of times and count where
// everyone finishes. See docs/odds.md for the plain-English version.
// Managers are keyed by entry_id, like the rest of the site.

import { scores } from "./results";
import type { LeagueDetails, Player } from "./types";

export interface OddsRow {
  entryId: number;
  /** Chance of finishing in each place: [0] is 1st. Adds up to 1. */
  places: number[];
  /** Chance of the lowest total points scored (the daily selfie). */
  lowestTotal: number;
  /** Chance of being one of the two managers with the season's lowest single gameweek scores. */
  lowestWeek: number;
  /** The weekly score the model expects from them from here on. */
  expected: number;
  /** Worst single gameweek so far. */
  worstWeek: number | null;
}

export interface OddsOptions {
  /** Each manager's squad strength (see squadStrength), keyed by entry_id. */
  strength?: Map<number, number>;
  runs?: number;
  seed?: number;
}

/** How many weeks of real results it takes before they count as much as the league average. */
const SHRINK_WEEKS = 6;
/** How far a manager's true level can drift over a season (trades, injuries, waivers), in points a week. */
const DRIFT = 3;
/** Squad strength weight: high early in the season, never below 30%. */
const squadWeight = (played: number) => Math.max(0.3, 8 / (played + 8));

export function seasonOdds(details: LeagueDetails, opts: OddsOptions = {}): OddsRow[] {
  const runs = opts.runs ?? 10_000;
  const rand = mulberry32(opts.seed ?? 2627);
  const ids = details.league_entries.map((e) => e.entry_id);
  const toEntry = new Map(details.league_entries.map((e) => [e.id, e.entry_id]));
  const n = ids.length;
  const idx = new Map(ids.map((id, i) => [id, i]));

  // Where things stand.
  const done = scores(details);
  const leaguePts = new Array(n).fill(0);
  const pointsFor = new Array(n).fill(0);
  const worst = new Array<number>(n).fill(Infinity);
  const played = new Array(n).fill(0);
  for (const s of done) {
    const i = idx.get(s.entryId)!;
    leaguePts[i] += s.result === "W" ? 3 : s.result === "D" ? 1 : 0;
    pointsFor[i] += s.score;
    worst[i] = Math.min(worst[i], s.score);
    played[i]++;
  }

  // What each manager is likely to score each week.
  const all = done.map((s) => s.score);
  const leagueMean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 45;
  const sd = all.length > 2 ? Math.sqrt(all.reduce((a, b) => a + (b - leagueMean) ** 2, 0) / (all.length - 1)) : 15;
  const strengths = ids.map((id) => opts.strength?.get(id));
  const known = strengths.filter((x): x is number => x !== undefined && x > 0);
  const avgStrength = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  const mean = ids.map((_, i) => {
    const form = (pointsFor[i] + SHRINK_WEEKS * leagueMean) / (played[i] + SHRINK_WEEKS);
    const st = strengths[i];
    if (!st || !avgStrength) return form;
    const w = squadWeight(played[i]);
    return (1 - w) * form + w * leagueMean * (st / avgStrength);
  });

  const left = details.matches
    .filter((m) => !m.finished)
    .map((m) => [idx.get(toEntry.get(m.league_entry_1)!)!, idx.get(toEntry.get(m.league_entry_2)!)!, m.event] as const)
    .filter(([a, b]) => a !== undefined && b !== undefined);

  const placeCount = ids.map(() => new Array(n).fill(0));
  const lowTotal = new Array(n).fill(0);
  const lowWeek = new Array(n).fill(0);
  const pts = new Array(n);
  const pf = new Array(n);
  const low = new Array(n);
  const tie = new Array(n);
  const order = ids.map((_, i) => i);
  // We only have a few weeks of results, so each run starts from a slightly
  // different guess at how good everyone really is.
  const unsure = ids.map((_, i) => Math.sqrt(sd ** 2 / (played[i] + SHRINK_WEEKS) + DRIFT ** 2));
  const level = new Array(n);
  const roll = (i: number) => Math.max(0, Math.round(level[i] + sd * normal(rand)));

  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < n; i++) {
      pts[i] = leaguePts[i];
      pf[i] = pointsFor[i];
      low[i] = worst[i];
      tie[i] = rand();
      level[i] = mean[i] + unsure[i] * normal(rand);
    }
    for (const [a, b] of left) {
      const sa = roll(a);
      const sb = roll(b);
      pts[a] += sa > sb ? 3 : sa === sb ? 1 : 0;
      pts[b] += sb > sa ? 3 : sa === sb ? 1 : 0;
      pf[a] += sa;
      pf[b] += sb;
      if (sa < low[a]) low[a] = sa;
      if (sb < low[b]) low[b] = sb;
    }
    // Table: league points, then points scored, then a coin toss.
    order.sort((x, y) => pts[y] - pts[x] || pf[y] - pf[x] || tie[y] - tie[x]);
    order.forEach((i, place) => placeCount[i][place]++);
    lowTotal[pickLowest(pf, tie)]++;
    // The two different managers with the season's lowest single gameweeks.
    const byLow = [...order].sort((x, y) => low[x] - low[y] || tie[x] - tie[y]);
    lowWeek[byLow[0]]++;
    lowWeek[byLow[1]]++;
  }

  return ids.map((entryId, i) => ({
    entryId,
    places: placeCount[i].map((c) => c / runs),
    lowestTotal: lowTotal[i] / runs,
    lowestWeek: lowWeek[i] / runs,
    expected: mean[i],
    worstWeek: Number.isFinite(worst[i]) ? worst[i] : null,
  }));
}

function pickLowest(values: number[], tie: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[best] || (values[i] === values[best] && tie[i] < tie[best])) best = i;
  }
  return best;
}

/** A typical squad player's points per game, assumed until a player has shown otherwise. */
const PRIOR_PPG = 2;
/** How many appearances that assumption is worth. */
const PRIOR_GAMES = 3;

/**
 * Points per game, pulled towards a typical player's until there are enough
 * appearances to trust it. One 16-point cameo shouldn't make a player look
 * like the best in the league.
 */
export function steadyPointsPerGame(p: Player): number {
  const apps =
    p.pointsPerGame > 0 ? Math.round(p.totalPoints / p.pointsPerGame) : p.minutes > 0 ? Math.max(1, Math.round(p.minutes / 90)) : 0;
  return (p.pointsPerGame * apps + PRIOR_PPG * PRIOR_GAMES) / (apps + PRIOR_GAMES);
}

/**
 * Rough weekly points a squad should bring in: the best valid XI picked on
 * steadied points per game, scaled down for injury doubts. Only used relative
 * to the rest of the league, so the exact scale doesn't matter.
 */
export function squadStrength(squad: Player[]): number {
  const value = (p: Player) => {
    if (["i", "s", "u", "n"].includes(p.status)) return 0;
    return steadyPointsPerGame(p) * (p.chanceNext ?? 100) / 100;
  };
  const sorted = [...squad].sort((a, b) => value(b) - value(a));
  const xi: Player[] = [];
  const take = (pos: Player["position"], count: number) => {
    for (const p of sorted) {
      if (count === 0) break;
      if (p.position === pos && !xi.includes(p)) {
        xi.push(p);
        count--;
      }
    }
  };
  take("GKP", 1);
  take("DEF", 3);
  take("MID", 2);
  take("FWD", 1);
  for (const p of sorted) {
    if (xi.length >= 11) break;
    if (p.position !== "GKP" && !xi.includes(p)) xi.push(p);
  }
  return xi.reduce((a, p) => a + value(p), 0);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number): number {
  const u = 1 - rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
