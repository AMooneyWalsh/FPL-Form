// Rivalries: everything between two managers on one page. Their record and
// numbers side by side, how they'd have done playing every week, the trades
// and waiver battles between them, and the players who've played for both.
// Explained in docs/power-and-rivalries.md.

import { draftGrades, pickReports, type DraftGrade } from "./draft";
import {
  playerJourney,
  tradeLedger,
  tradeVerdicts,
  waiverBattles,
  waiverRecord,
  type LedgerRow,
  type Seasons,
  type TradeVerdict,
  type WaiverBattle,
  type WaiverRow,
} from "./moves";
import { fixtureLuck, headToHead, nextMeeting, scores, type HeadToHead, type LuckRow, type Score } from "./results";
import { computeStandings, type StandingRow } from "./standings";
import type { DraftChoice, LeagueDetails, Trade, Transaction } from "./types";

export interface RivalryInput {
  details: LeagueDetails;
  seasons: Seasons;
  /** Processed trades, with same-gameweek swap-backs already cancelled out. */
  trades: Trade[];
  transactions: Transaction[];
  draft: DraftChoice[];
}

/** The league-wide numbers every pair draws on, worked out once. */
export interface RivalryContext {
  input: RivalryInput;
  standings: StandingRow[];
  scores: Score[];
  luck: LuckRow[];
  verdicts: TradeVerdict[];
  ledger: LedgerRow[];
  waivers: WaiverRow[];
  battles: WaiverBattle[];
  grades: DraftGrade[];
}

export function rivalryContext(input: RivalryInput): RivalryContext {
  const ids = input.details.league_entries.map((e) => e.entry_id);
  const verdicts = tradeVerdicts(input.trades, input.seasons, input.transactions);
  return {
    input,
    standings: computeStandings(input.details),
    scores: scores(input.details),
    luck: fixtureLuck(input.details),
    verdicts,
    ledger: tradeLedger(verdicts, ids),
    waivers: waiverRecord(input.transactions, input.seasons, ids),
    battles: waiverBattles(input.transactions, input.seasons),
    grades: draftGrades(pickReports(input.draft, input.seasons)),
  };
}

export type TapeKey =
  | "position"
  | "leaguePoints"
  | "scored"
  | "average"
  | "highest"
  | "luck"
  | "tradeNet"
  | "pickups"
  | "draftGrade";

/** One line of the tale of the tape. */
export interface TapeRow {
  key: TapeKey;
  a: number;
  b: number;
  /** "low" for places, where 1st beats 2nd. */
  better: "high" | "low";
  /** entry_id of whoever's better on this, null if level. */
  leader: number | null;
}

export interface Rivalry {
  a: number;
  b: number;
  tape: TapeRow[];
  meetings: HeadToHead;
  /** Gameweek of their next match, if there's one still to come. */
  next: number | null;
  /** Every finished gameweek, as if they'd played each other every time. */
  everyWeek: { aAhead: number; bAhead: number; level: number };
  /** Trades between the two, newest first. */
  trades: TradeVerdict[];
  /** Across those trades. `net` adds up the verdict margins: plus means a is ahead. Pending ones don't count. */
  tradeTally: { aWon: number; bWon: number; level: number; pending: number; net: number };
  /** Waiver battles both put a claim in for, newest first. */
  battles: WaiverBattle[];
  /** `other`: someone else got him, or nobody did. */
  battleTally: { aWon: number; bWon: number; other: number };
  /** Players who've been in both squads, most points first. */
  shared: SharedPlayer[];
}

export interface SharedPlayer {
  element: number;
  /** Points he scored in each one's starting XI. */
  aPoints: number;
  bPoints: number;
  /** Who had him first. */
  first: number;
}

export function rivalry(ctx: RivalryContext, a: number, b: number): Rivalry {
  const { details, seasons } = ctx.input;
  const pair = (x: number, y: number) => (x === a && y === b) || (x === b && y === a);

  const trades = ctx.verdicts.filter((v) => pair(v.offerer.entryId, v.receiver.entryId));
  const tradeTally = { aWon: 0, bWon: 0, level: 0, pending: 0, net: 0 };
  for (const v of trades) {
    if (v.pending) tradeTally.pending++;
    else if (v.winner === null) tradeTally.level++;
    else if (v.winner === a) {
      tradeTally.aWon++;
      tradeTally.net += v.margin;
    } else {
      tradeTally.bWon++;
      tradeTally.net -= v.margin;
    }
  }

  const battles = ctx.battles.filter((w) => w.claims.some((c) => c.entryId === a) && w.claims.some((c) => c.entryId === b));
  const battleTally = { aWon: 0, bWon: 0, other: 0 };
  for (const w of battles) {
    if (w.winner === a) battleTally.aWon++;
    else if (w.winner === b) battleTally.bWon++;
    else battleTally.other++;
  }

  return {
    a,
    b,
    tape: tape(ctx, a, b),
    meetings: headToHead(details, a, b),
    next: nextMeeting(details, a, b),
    everyWeek: everyWeek(ctx.scores, a, b),
    trades,
    tradeTally,
    battles,
    battleTally,
    shared: sharedPlayers(ctx.input, seasons, a, b),
  };
}

function tape(ctx: RivalryContext, a: number, b: number): TapeRow[] {
  const standing = (id: number) => ctx.standings.find((r) => r.entryId === id);
  const mine = (id: number) => ctx.scores.filter((s) => s.entryId === id).map((s) => s.score);
  const grade = (id: number) => ctx.grades.findIndex((g) => g.entryId === id) + 1;
  const values: Record<TapeKey, [(id: number) => number, TapeRow["better"]]> = {
    position: [(id) => standing(id)?.rank ?? ctx.standings.length, "low"],
    leaguePoints: [(id) => standing(id)?.total ?? 0, "high"],
    scored: [(id) => standing(id)?.pointsFor ?? 0, "high"],
    average: [(id) => round1(average(mine(id))), "high"],
    highest: [(id) => Math.max(0, ...mine(id)), "high"],
    luck: [(id) => ctx.luck.find((r) => r.entryId === id)?.luck ?? 0, "high"],
    tradeNet: [(id) => ctx.ledger.find((r) => r.entryId === id)?.net ?? 0, "high"],
    pickups: [(id) => ctx.waivers.find((r) => r.entryId === id)?.pickupPoints ?? 0, "high"],
    draftGrade: [(id) => grade(id) || ctx.grades.length, "low"],
  };
  return (Object.keys(values) as TapeKey[]).map((key) => {
    const [get, better] = values[key];
    const va = get(a);
    const vb = get(b);
    const aBetter = better === "high" ? va > vb : va < vb;
    return { key, a: va, b: vb, better, leader: va === vb ? null : aBetter ? a : b };
  });
}

function everyWeek(all: Score[], a: number, b: number): Rivalry["everyWeek"] {
  const theirs = new Map(all.filter((s) => s.entryId === b).map((s) => [s.event, s.score]));
  const out = { aAhead: 0, bAhead: 0, level: 0 };
  for (const s of all) {
    if (s.entryId !== a) continue;
    const other = theirs.get(s.event);
    if (other === undefined) continue;
    if (s.score > other) out.aAhead++;
    else if (s.score < other) out.bAhead++;
    else out.level++;
  }
  return out;
}

function sharedPlayers(input: RivalryInput, seasons: Seasons, a: number, b: number): SharedPlayer[] {
  const owned = (id: number) => {
    const set = new Set<number>();
    for (const gw of seasons.gameweeks) {
      const s = gw.squads[id];
      if (s) [...s.played, ...s.bench].forEach((el) => set.add(el));
    }
    return set;
  };
  const theirs = owned(b);
  const both = [...owned(a)].filter((el) => theirs.has(el));
  return both
    .map((element) => {
      const stints = playerJourney(element, seasons, input).filter((s) => s.entryId === a || s.entryId === b);
      const points = (id: number) => stints.filter((s) => s.entryId === id).reduce((sum, s) => sum + s.points, 0);
      return { element, aPoints: points(a), bPoints: points(b), first: stints[0].entryId };
    })
    .sort((x, y) => y.aPoints + y.bPoints - (x.aPoints + x.bPoints) || x.element - y.element);
}

function average(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
