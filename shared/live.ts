// Live gameweek scoring: provisional bonus, projected auto-subs and live H2H
// scores, worked out the way FPL Draft does. See docs/live-scoring.md.

import { computeStandings, type StandingRow } from "./standings";
import type { LeagueDetails, Player, SquadRules } from "./types";

type Position = Player["position"];

// ---------------------------------------------------------------- data shapes

/** The stats that score points, in the order they're shown. */
export const STAT_KEYS = [
  "goals_scored",
  "assists",
  "clean_sheets",
  "goals_conceded",
  "own_goals",
  "penalties_saved",
  "penalties_missed",
  "yellow_cards",
  "red_cards",
  "saves",
  "defensive_contribution",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface LiveElement {
  minutes: number;
  /** FPL's running total. Includes bonus only once FPL has confirmed it. */
  points: number;
  bonus: number;
  bps: number;
  /** 1 if he started the match (0 means he came off the bench or didn't play). */
  starts: number;
  /** Non-zero match stats only. */
  stats: Partial<Record<StatKey | "minutes", number>>;
  /** Where his points came from: [stat, count, points], e.g. ["clean_sheets", 1, 4]. */
  breakdown: [string, number, number][];
}

/** Match events, for the fixtures view. */
export const EVENT_KEYS = [
  "goals_scored",
  "assists",
  "own_goals",
  "penalties_saved",
  "penalties_missed",
  "yellow_cards",
  "red_cards",
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];
export interface MatchEvent {
  element: number;
  value: number;
  home: boolean;
}

export interface LiveFixture {
  id: number;
  kickoff: string | null;
  started: boolean;
  finished: boolean;
  /** Final whistle blown; `finished` follows once FPL has checked the data. */
  finishedProvisional: boolean;
  minutes: number;
  teamH: number;
  teamA: number;
  scoreH: number | null;
  scoreA: number | null;
  /** FPL has added the official bonus to players' points. */
  bonusConfirmed: boolean;
  /** Bonus points system scores for everyone who played, both teams. */
  bps: { element: number; value: number }[];
  /** Goals, assists, cards and so on, with who did them. */
  events: Partial<Record<EventKey, MatchEvent[]>>;
}

export interface LivePicks {
  picks: { element: number; position: number }[];
  /** Auto-subs FPL has applied (only after the gameweek is processed). */
  subs: { element_in: number; element_out: number }[];
}

export interface LiveGameweek {
  event: number;
  elements: Record<number, LiveElement>;
  fixtures: LiveFixture[];
  /** Keyed by entry_id. Empty before the deadline, when squads are hidden. */
  picks: Record<number, LivePicks>;
}

export interface PlayerInfo {
  position: Position;
  teamId: number;
}

// ---------------------------------------------------------------- raw -> LiveGameweek

interface RawStat {
  s: string;
  h: { element: number; value: number }[];
  a: { element: number; value: number }[];
}

export interface RawLiveResponse {
  elements: Record<
    string,
    {
      stats: { minutes: number; total_points: number; bonus: number; bps: number; starts?: number } & Partial<
        Record<StatKey, number>
      >;
      explain?: [{ stat: string; value: number; points: number }[], number][];
    }
  >;
  fixtures: {
    id: number;
    kickoff_time: string | null;
    started: boolean;
    finished: boolean;
    finished_provisional: boolean;
    minutes: number;
    team_h: number;
    team_a: number;
    team_h_score: number | null;
    team_a_score: number | null;
    stats: RawStat[];
  }[];
}

/** Shrinks FPL's live response (~450 KB) to what live scoring needs. */
export function toLiveGameweek(event: number, raw: RawLiveResponse, picks: Record<number, LivePicks>): LiveGameweek {
  const elements: Record<number, LiveElement> = {};
  for (const [id, el] of Object.entries(raw.elements)) {
    const s = el.stats;
    if (s.minutes === 0 && s.total_points === 0 && s.bps === 0) continue;
    const stats: LiveElement["stats"] = {};
    for (const k of ["minutes", ...STAT_KEYS] as const) {
      const v = s[k];
      if (v) stats[k] = v;
    }
    // Merge double-gameweek lines so "Minutes" appears once with both games added.
    const merged = new Map<string, [number, number]>();
    for (const [items] of el.explain ?? []) {
      for (const x of items) {
        const cur = merged.get(x.stat) ?? [0, 0];
        merged.set(x.stat, [cur[0] + x.value, cur[1] + x.points]);
      }
    }
    elements[Number(id)] = {
      minutes: s.minutes,
      points: s.total_points,
      bonus: s.bonus,
      bps: s.bps,
      starts: s.starts ?? 0,
      stats,
      breakdown: [...merged.entries()].map(([stat, [value, points]]) => [stat, value, points]),
    };
  }
  const fixtures: LiveFixture[] = raw.fixtures.map((f) => {
    const stat = (name: string) => f.stats.find((s) => s.s === name);
    const bonus = stat("bonus");
    const bps = stat("bps");
    return {
      id: f.id,
      kickoff: f.kickoff_time,
      started: f.started,
      finished: f.finished,
      finishedProvisional: f.finished_provisional,
      minutes: f.minutes,
      teamH: f.team_h,
      teamA: f.team_a,
      scoreH: f.team_h_score,
      scoreA: f.team_a_score,
      bonusConfirmed: !!bonus && bonus.h.length + bonus.a.length > 0,
      bps: bps ? [...bps.h, ...bps.a] : [],
      events: Object.fromEntries(
        EVENT_KEYS.flatMap((k) => {
          const st = stat(k);
          const list = st
            ? [...st.h.map((x) => ({ ...x, home: true })), ...st.a.map((x) => ({ ...x, home: false }))]
            : [];
          return list.length ? [[k, list]] : [];
        }),
      ),
    };
  });
  return { event, elements, fixtures, picks };
}

// ---------------------------------------------------------------- bonus

/**
 * Bonus points from one match's BPS, as FPL awards them: 3, 2 and 1 to the
 * top three. Ties share the higher award, and the next award down is skipped
 * for each extra player tied (e.g. two tied first both get 3, the next gets 1).
 */
export function bonusFromBps(bps: { element: number; value: number }[]): Map<number, number> {
  const sorted = [...bps].sort((a, b) => b.value - a.value);
  const awards = new Map<number, number>();
  let place = 1;
  let i = 0;
  while (place <= 3 && i < sorted.length) {
    const group = sorted.filter((p) => p.value === sorted[i].value);
    for (const p of group) awards.set(p.element, 4 - place);
    place += group.length;
    i += group.length;
  }
  return awards;
}

/** Provisional bonus per player for matches under way or awaiting confirmation. */
export function provisionalBonus(gw: LiveGameweek): Map<number, number> {
  const out = new Map<number, number>();
  for (const f of gw.fixtures) {
    if (!f.started || f.bonusConfirmed) continue;
    for (const [el, pts] of bonusFromBps(f.bps)) out.set(el, (out.get(el) ?? 0) + pts);
  }
  return out;
}

// ---------------------------------------------------------------- squads

export type PlayerStatus = "played" | "playing" | "to-play" | "did-not-play" | "no-game";

export interface LivePlayer {
  element: number;
  /** 1-11 starting, 12-15 bench in order. */
  slot: number;
  position: Position;
  /** Points including provisional bonus. */
  points: number;
  provisionalBonus: number;
  /** Bonus FPL has confirmed. */
  bonus: number;
  minutes: number;
  status: PlayerStatus;
  teamId: number;
  /** Non-zero match stats (minutes, goals, assists, clean sheet, saves, ...). */
  stats: LiveElement["stats"];
  breakdown: LiveElement["breakdown"];
  /** He started the match. */
  started: boolean;
  /** He came on as a substitute in the real match. */
  cameOn: boolean;
  /** He was taken off (or sent off) before the end of a finished match. */
  cameOff: boolean;
  /** In the XI that counts (after subs). */
  counts: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  /** The player he was auto-subbed for (either direction). */
  subFor?: number;
}

export interface LiveSquad {
  entryId: number;
  players: LivePlayer[];
  score: number;
  /** Counting players whose games are done or under way. */
  started: number;
  /** Counting players still to play. */
  toPlay: number;
  /** Points scored by players who didn't count (the bench, and anyone subbed out). */
  benchPoints: number;
  /** Subs came from FPL (true) or are our projection (false). */
  officialSubs: boolean;
}

/** A club's matches this gameweek (none, one, or two in a double gameweek). */
export function gamesOf(teamId: number | undefined, gw: LiveGameweek): LiveFixture[] {
  return gw.fixtures.filter((f) => f.teamH === teamId || f.teamA === teamId);
}

function statusOf(element: number, gw: LiveGameweek, info: Map<number, PlayerInfo>): PlayerStatus {
  const team = info.get(element)?.teamId;
  const games = gamesOf(team, gw);
  if (games.length === 0) return "no-game";
  const minutes = gw.elements[element]?.minutes ?? 0;
  if (games.some((f) => f.started && !f.finishedProvisional)) return "playing";
  if (games.some((f) => !f.started)) return minutes > 0 ? "playing" : "to-play";
  return minutes > 0 ? "played" : "did-not-play";
}

export function liveSquad(
  entryId: number,
  gw: LiveGameweek,
  info: Map<number, PlayerInfo>,
  rules: SquadRules,
): LiveSquad | null {
  const listed = gw.picks[entryId];
  if (!listed) return null;
  const officialSubs = listed.subs.length > 0;
  // Show the lineup as the manager set it; the subs are applied below.
  const raw = officialSubs ? { ...lineupAsPicked(listed, info, rules), subs: listed.subs } : listed;
  const bonus = provisionalBonus(gw);
  const players: LivePlayer[] = [...raw.picks]
    .sort((a, b) => a.position - b.position)
    .map((p) => {
      const el = gw.elements[p.element];
      const prov = bonus.get(p.element) ?? 0;
      const status = statusOf(p.element, gw, info);
      const started = (el?.starts ?? 0) > 0;
      return {
        element: p.element,
        slot: p.position,
        position: info.get(p.element)?.position ?? "MID",
        points: (el?.points ?? 0) + prov,
        provisionalBonus: prov,
        bonus: el?.bonus ?? 0,
        minutes: el?.minutes ?? 0,
        status,
        teamId: info.get(p.element)?.teamId ?? 0,
        stats: el?.stats ?? {},
        breakdown: el?.breakdown ?? [],
        started,
        cameOn: !started && (el?.minutes ?? 0) > 0,
        // Only judged once his matches are over, so a live player isn't marked off early.
        cameOff: started && status === "played" && (el?.minutes ?? 0) < 90 * gamesOf(info.get(p.element)?.teamId, gw).filter((f) => f.finishedProvisional).length,
        counts: p.position <= rules.play,
        subbedIn: false,
        subbedOut: false,
      };
    });

  const swap = (outEl: number, inEl: number) => {
    const out = players.find((p) => p.element === outEl);
    const inn = players.find((p) => p.element === inEl);
    if (!out || !inn) return;
    out.counts = false;
    out.subbedOut = true;
    inn.counts = true;
    inn.subbedIn = true;
    out.subFor = inEl;
    inn.subFor = outEl;
  };
  if (officialSubs) {
    for (const s of raw.subs) swap(s.element_out, s.element_in);
  } else {
    for (const [outEl, inEl] of projectSubs(players, rules)) swap(outEl, inEl);
  }

  const counting = players.filter((p) => p.counts);
  return {
    entryId,
    players,
    score: counting.reduce((s, p) => s + p.points, 0),
    started: counting.filter((p) => p.status === "played" || p.status === "playing" || p.status === "did-not-play").length,
    toPlay: counting.filter((p) => p.status === "to-play").length,
    benchPoints: players.filter((p) => !p.counts).reduce((sum, p) => sum + p.points, 0),
    officialSubs,
  };
}

/**
 * After a gameweek is processed FPL writes its auto-subs into the lineup
 * (each sub swaps slots with the starter he replaced) and re-sorts the XI by
 * position. This puts the lineup back the way the manager set it, with no
 * subs listed. The order within a position is FPL's, the best we can know.
 */
export function lineupAsPicked(p: LivePicks, info: Map<number, PlayerInfo>, rules: SquadRules): LivePicks {
  const slot = new Map(p.picks.map((x) => [x.element, x.position]));
  for (const s of [...p.subs].reverse()) {
    const a = slot.get(s.element_in);
    const b = slot.get(s.element_out);
    if (a === undefined || b === undefined) continue;
    slot.set(s.element_in, b);
    slot.set(s.element_out, a);
  }
  const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
  const pos = (el: number) => order[info.get(el)?.position ?? "MID"];
  const xi = [...slot.entries()].filter(([, n]) => n <= rules.play).sort((a, b) => pos(a[0]) - pos(b[0]) || a[1] - b[1]);
  xi.forEach(([el], i) => slot.set(el, i + 1));
  return { picks: p.picks.map((x) => ({ element: x.element, position: slot.get(x.element)! })), subs: [] };
}

/**
 * The auto-subs FPL will make: a starter who won't play (his games are over
 * with 0 minutes, or he has none) is replaced by the first bench player, in
 * bench order, who has played and keeps the formation legal. Keepers only
 * swap with the bench keeper.
 */
export function projectSubs(players: LivePlayer[], rules: SquadRules): [number, number][] {
  const xi = players.filter((p) => p.slot <= rules.play);
  const bench = players.filter((p) => p.slot > rules.play);
  const current = new Set(xi.map((p) => p.element));
  const used = new Set<number>();
  const subs: [number, number][] = [];
  const counts = () => {
    const c: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of players) if (current.has(p.element)) c[p.position]++;
    return c;
  };
  for (const starter of xi) {
    if (starter.status !== "did-not-play" && starter.status !== "no-game") continue;
    for (const sub of bench) {
      if (used.has(sub.element) || sub.minutes === 0) continue;
      if ((starter.position === "GKP") !== (sub.position === "GKP")) continue;
      const after = counts();
      after[starter.position]--;
      after[sub.position]++;
      const legal = (Object.keys(after) as Position[]).every(
        (pos) => after[pos] >= rules.minPlay[pos] && after[pos] <= rules.maxPlay[pos],
      );
      if (!legal) continue;
      current.delete(starter.element);
      current.add(sub.element);
      used.add(sub.element);
      subs.push([starter.element, sub.element]);
      break;
    }
  }
  return subs;
}

// ---------------------------------------------------------------- matches and table

export interface LiveMatch {
  home: LiveSquad | null;
  away: LiveSquad | null;
  homeEntry: number;
  awayEntry: number;
}

export function liveMatches(
  details: LeagueDetails,
  gw: LiveGameweek,
  info: Map<number, PlayerInfo>,
  rules: SquadRules,
): LiveMatch[] {
  const toEntry = new Map(details.league_entries.map((e) => [e.id, e.entry_id]));
  return details.matches
    .filter((m) => m.event === gw.event)
    .map((m) => {
      const homeEntry = toEntry.get(m.league_entry_1)!;
      const awayEntry = toEntry.get(m.league_entry_2)!;
      return {
        homeEntry,
        awayEntry,
        home: liveSquad(homeEntry, gw, info, rules),
        away: liveSquad(awayEntry, gw, info, rules),
      };
    });
}

/** The league table as it would stand if this gameweek finished now. */
export function liveTable(details: LeagueDetails, event: number, matches: LiveMatch[]): StandingRow[] {
  const toLeague = new Map(details.league_entries.map((e) => [e.entry_id, e.id]));
  const scores = new Map<number, number>();
  for (const m of matches) {
    if (m.home) scores.set(toLeague.get(m.homeEntry)!, m.home.score);
    if (m.away) scores.set(toLeague.get(m.awayEntry)!, m.away.score);
  }
  return computeStandings({
    ...details,
    matches: details.matches.map((m) =>
      m.event === event && scores.has(m.league_entry_1) && scores.has(m.league_entry_2)
        ? {
            ...m,
            finished: true,
            league_entry_1_points: scores.get(m.league_entry_1)!,
            league_entry_2_points: scores.get(m.league_entry_2)!,
          }
        : m,
    ),
  });
}

// ---------------------------------------------------------------- league-wide views

export interface Owner {
  entryId: number;
  /** In the XI that counts (false = on the bench, or subbed out). */
  counts: boolean;
}

/** Who in the league owns each player this gameweek (a player has one owner). */
export function leagueOwners(matches: LiveMatch[]): Map<number, Owner> {
  const out = new Map<number, Owner>();
  for (const m of matches) {
    for (const squad of [m.home, m.away]) {
      if (!squad) continue;
      for (const p of squad.players) out.set(p.element, { entryId: squad.entryId, counts: p.counts });
    }
  }
  return out;
}

export interface Performer {
  element: number;
  entryId: number;
  points: number;
  counts: boolean;
}

/**
 * The gameweek's best scores among players in the XI that counted, and the
 * best scores stuck on benches ("left on the bench").
 */
export function topPerformers(matches: LiveMatch[], n = 5): { best: Performer[]; benched: Performer[] } {
  const all: Performer[] = [];
  for (const m of matches) {
    for (const squad of [m.home, m.away]) {
      if (!squad) continue;
      for (const p of squad.players) all.push({ element: p.element, entryId: squad.entryId, points: p.points, counts: p.counts });
    }
  }
  const byPoints = (a: Performer, b: Performer) => b.points - a.points || a.element - b.element;
  return {
    best: all.filter((p) => p.counts).sort(byPoints).slice(0, n),
    benched: all.filter((p) => !p.counts && p.points > 0).sort(byPoints).slice(0, n),
  };
}

export interface BonusRow {
  element: number;
  bps: number;
  /** 3, 2, 1 or 0. */
  bonus: number;
}

export interface FixtureBonus {
  fixture: LiveFixture;
  /** Highest BPS first. Empty until the match has started. */
  rows: BonusRow[];
}

/** Every started match's BPS leaders with the bonus they'd get (or got, once confirmed). */
export function bonusTable(gw: LiveGameweek, top = 8): FixtureBonus[] {
  return [...gw.fixtures]
    .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "") || a.id - b.id)
    .map((fixture) => {
      if (!fixture.started) return { fixture, rows: [] };
      const awards = bonusFromBps(fixture.bps);
      const sorted = [...fixture.bps].sort((a, b) => b.value - a.value || a.element - b.element);
      // Show everyone who gets bonus (ties can make it more than 3), then the next few.
      const awarded = sorted.filter((p) => awards.has(p.element)).length;
      return {
        fixture,
        rows: sorted.slice(0, Math.max(top, awarded)).map((p) => ({ element: p.element, bps: p.value, bonus: awards.get(p.element) ?? 0 })),
      };
    });
}
