// Live gameweek scoring: provisional bonus, projected auto-subs and live H2H
// scores, worked out the way FPL Draft does. See docs/live-scoring.md.

import { computeStandings, type StandingRow } from "./standings";
import type { LeagueDetails, Player, SquadRules } from "./types";

type Position = Player["position"];

// ---------------------------------------------------------------- data shapes

export interface LiveElement {
  minutes: number;
  /** FPL's running total. Includes bonus only once FPL has confirmed it. */
  points: number;
  bonus: number;
  bps: number;
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
  elements: Record<string, { stats: { minutes: number; total_points: number; bonus: number; bps: number } }>;
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
    elements[Number(id)] = { minutes: s.minutes, points: s.total_points, bonus: s.bonus, bps: s.bps };
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
  minutes: number;
  status: PlayerStatus;
  /** In the XI that counts (after subs). */
  counts: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
}

export interface LiveSquad {
  entryId: number;
  players: LivePlayer[];
  score: number;
  /** Counting players whose games are done or under way. */
  started: number;
  /** Counting players still to play. */
  toPlay: number;
  /** Subs came from FPL (true) or are our projection (false). */
  officialSubs: boolean;
}

function statusOf(element: number, gw: LiveGameweek, info: Map<number, PlayerInfo>): PlayerStatus {
  const team = info.get(element)?.teamId;
  const games = gw.fixtures.filter((f) => f.teamH === team || f.teamA === team);
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
  const raw = gw.picks[entryId];
  if (!raw) return null;
  const bonus = provisionalBonus(gw);
  const players: LivePlayer[] = [...raw.picks]
    .sort((a, b) => a.position - b.position)
    .map((p) => {
      const el = gw.elements[p.element];
      const prov = bonus.get(p.element) ?? 0;
      return {
        element: p.element,
        slot: p.position,
        position: info.get(p.element)?.position ?? "MID",
        points: (el?.points ?? 0) + prov,
        provisionalBonus: prov,
        minutes: el?.minutes ?? 0,
        status: statusOf(p.element, gw, info),
        counts: p.position <= rules.play,
        subbedIn: false,
        subbedOut: false,
      };
    });

  const officialSubs = raw.subs.length > 0;
  const swap = (outEl: number, inEl: number) => {
    const out = players.find((p) => p.element === outEl);
    const inn = players.find((p) => p.element === inEl);
    if (!out || !inn) return;
    out.counts = false;
    out.subbedOut = true;
    inn.counts = true;
    inn.subbedIn = true;
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
    officialSubs,
  };
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
