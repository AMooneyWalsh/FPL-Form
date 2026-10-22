// Power rankings: who's actually good right now, which the H2H table only
// half tells you. Mixes recent scores, the season average, an all-play record
// (fixture luck taken out) and how strong each squad is today, so a trade
// counts straight away. Explained in docs/power-and-rivalries.md.

import { bestXIScore } from "./draft";
import type { Seasons } from "./moves";
import { lastFinishedEvent, scores, type Score } from "./results";
import { computeStandings } from "./standings";
import type { LeagueDetails, Player, SquadRules } from "./types";

/** How many gameweeks count as "recent", for both scores and squad strength. */
export const RECENT = 4;

/** How much each ingredient counts. They add up to 1. */
export const WEIGHTS = { recent: 0.35, season: 0.25, allPlay: 0.2, squad: 0.2 } as const;

export interface AllPlay {
  /** Weeks x other managers they outscored. */
  won: number;
  drawn: number;
  lost: number;
}

export interface PowerRow {
  entryId: number;
  rank: number;
  /** Weighted z-scores: 0 is the league average, +1 is one spread above it. */
  power: number;
  /** Average score over the last RECENT finished gameweeks. */
  recent: number;
  /** Average score all season. */
  season: number;
  /** Every week against every other manager. */
  allPlay: AllPlay;
  /** Average best XI from the squad, over the last RECENT finished gameweeks. */
  squad: number;
  /** Place in the H2H table at the same point. */
  tableRank: number;
  /** Power rank after the gameweek before, if there was one. */
  previousRank: number | null;
}

export interface PowerInput {
  details: LeagueDetails;
  seasons: Seasons;
  positions: Map<number, Player["position"]>;
  rules: SquadRules;
  /** Who owns each player right now (null = free agent). */
  owners: Map<number, number | null>;
}

/**
 * The rankings after the last finished gameweek, using everyone's squad as it
 * is right now, with each manager's rank from the gameweek before (using the
 * squad they had then) for the arrows.
 */
export function powerRankings(input: PowerInput): PowerRow[] {
  const last = lastFinishedEvent(input.details);
  if (last < 1) return [];
  const now = new Map<number, number[]>();
  for (const [element, owner] of input.owners) {
    if (owner !== null) now.set(owner, [...(now.get(owner) ?? []), element]);
  }
  const rows = powerAt(input, last, now);
  if (last < 2) return rows;
  const before = powerAt(input, last - 1, squadsIn(input.seasons, last - 1));
  const previous = new Map(before.map((r) => [r.entryId, r.rank]));
  return rows.map((r) => ({ ...r, previousRank: previous.get(r.entryId) ?? null }));
}

/** Everyone's 15 in one gameweek (empty if that gameweek isn't loaded). */
export function squadsIn(seasons: Seasons, event: number): Map<number, number[]> {
  const gw = seasons.gameweeks.find((g) => g.event === event);
  return new Map(
    Object.entries(gw?.squads ?? {}).map(([entryId, s]) => [Number(entryId), [...s.played, ...s.bench]]),
  );
}

/** The rankings as they stood after `event`, judging squad strength from `squads`. */
export function powerAt(input: PowerInput, event: number, squads: Map<number, number[]>): PowerRow[] {
  const { details, seasons, positions, rules } = input;
  const all = scores(details, 1, event);
  const ids = details.league_entries.map((e) => e.entry_id);
  const recentFrom = event - RECENT + 1;
  const byWeek = new Map<number, Score[]>();
  for (const s of all) byWeek.set(s.event, [...(byWeek.get(s.event) ?? []), s]);
  const recentGws = seasons.gameweeks.filter((g) => g.event >= recentFrom && g.event <= event);
  const table = new Map(computeStandings(details, event).map((r) => [r.entryId, r.rank]));

  const rows = ids.map((entryId) => {
    const mine = all.filter((s) => s.entryId === entryId);
    const allPlay: AllPlay = { won: 0, drawn: 0, lost: 0 };
    for (const s of mine) {
      for (const other of byWeek.get(s.event) ?? []) {
        if (other.entryId === entryId) continue;
        if (s.score > other.score) allPlay.won++;
        else if (s.score < other.score) allPlay.lost++;
        else allPlay.drawn++;
      }
    }
    const squad = squads.get(entryId) ?? [];
    return {
      entryId,
      rank: 0,
      power: 0,
      recent: average(mine.filter((s) => s.event >= recentFrom).map((s) => s.score)),
      season: average(mine.map((s) => s.score)),
      allPlay,
      squad: average(recentGws.map((gw) => bestXIScore(squad, gw, positions, rules))),
      tableRank: table.get(entryId) ?? ids.length,
      previousRank: null,
    };
  });

  const z = {
    recent: zScores(rows.map((r) => r.recent)),
    season: zScores(rows.map((r) => r.season)),
    allPlay: zScores(rows.map((r) => share(r.allPlay))),
    squad: zScores(rows.map((r) => r.squad)),
  };
  rows.forEach((r, i) => {
    r.power =
      WEIGHTS.recent * z.recent[i] +
      WEIGHTS.season * z.season[i] +
      WEIGHTS.allPlay * z.allPlay[i] +
      WEIGHTS.squad * z.squad[i];
  });
  // Level on power (only really before anyone has played) falls back to the table.
  rows.sort((a, b) => b.power - a.power || a.tableRank - b.tableRank);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** Share of all-play games won, a draw counting half. */
export function share(r: AllPlay): number {
  const games = r.won + r.drawn + r.lost;
  return games === 0 ? 0 : (r.won + r.drawn / 2) / games;
}

function average(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** How far each value is from the average, in standard deviations. All 0 if they're all the same. */
export function zScores(xs: number[]): number[] {
  const mean = average(xs);
  const sd = Math.sqrt(average(xs.map((x) => (x - mean) ** 2)));
  return xs.map((x) => (sd === 0 ? 0 : (x - mean) / sd));
}
