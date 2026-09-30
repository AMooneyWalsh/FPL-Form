// League results: form, fixture luck, head to head, streaks and records.
// Rebuilt from the old site's Results tab. Managers are identified by team
// entry_id throughout, like the rest of the new site.

import { computeStandings, type Result } from "./standings";
import type { LeagueDetails } from "./types";

/** One manager's side of one finished match. */
export interface Score {
  event: number;
  entryId: number;
  opponent: number;
  score: number;
  against: number;
  result: Result;
}

/** Every finished match, from both sides, in gameweek order. */
export function scores(details: LeagueDetails, from = 1, to = Infinity): Score[] {
  const toEntry = new Map(details.league_entries.map((e) => [e.id, e.entry_id]));
  const out: Score[] = [];
  for (const m of details.matches) {
    if (!m.finished || m.event < from || m.event > to) continue;
    const a = toEntry.get(m.league_entry_1);
    const b = toEntry.get(m.league_entry_2);
    if (a === undefined || b === undefined) continue;
    const pa = m.league_entry_1_points;
    const pb = m.league_entry_2_points;
    out.push({ event: m.event, entryId: a, opponent: b, score: pa, against: pb, result: pa > pb ? "W" : pa < pb ? "L" : "D" });
    out.push({ event: m.event, entryId: b, opponent: a, score: pb, against: pa, result: pb > pa ? "W" : pb < pa ? "L" : "D" });
  }
  return out.sort((x, y) => x.event - y.event);
}

export function lastFinishedEvent(details: LeagueDetails): number {
  return Math.max(0, ...details.matches.filter((m) => m.finished).map((m) => m.event));
}

// ---------------------------------------------------------------- positions

/** League position after each gameweek, keyed by entry_id. */
export function positionsByGameweek(details: LeagueDetails): { event: number; positions: Map<number, number> }[] {
  const last = lastFinishedEvent(details);
  const out: { event: number; positions: Map<number, number> }[] = [];
  for (let gw = 1; gw <= last; gw++) {
    out.push({ event: gw, positions: new Map(computeStandings(details, gw).map((r) => [r.entryId, r.rank])) });
  }
  return out;
}

// ---------------------------------------------------------------- fixture luck

export interface LuckRow {
  entryId: number;
  /** Gameweeks they scored above that week's league median. */
  expectedWins: number;
  wins: number;
  draws: number;
  losses: number;
  /** wins - expectedWins: positive is jammy, negative is robbed. */
  luck: number;
  pointsFor: number;
  pointsAgainst: number;
  played: number;
  /** Per gameweek: did they beat the median, and what happened. */
  weeks: { event: number; aboveMedian: boolean | null; result: Result; score: number; median: number }[];
}

/**
 * Fixture luck, as on the old site: in a gameweek, scoring above the league's
 * median "should" win. Luck is actual wins minus those expected wins. Scoring
 * exactly the median counts as neither.
 */
export function fixtureLuck(details: LeagueDetails, from = 1, to = Infinity): LuckRow[] {
  const all = scores(details, from, to);
  const rows = new Map<number, LuckRow>();
  for (const e of details.league_entries) {
    rows.set(e.entry_id, {
      entryId: e.entry_id,
      expectedWins: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      luck: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      played: 0,
      weeks: [],
    });
  }
  const events = [...new Set(all.map((s) => s.event))];
  for (const event of events) {
    const week = all.filter((s) => s.event === event);
    const median = medianOf(week.map((s) => s.score));
    for (const s of week) {
      const row = rows.get(s.entryId);
      if (!row) continue;
      row.played++;
      row.pointsFor += s.score;
      row.pointsAgainst += s.against;
      if (s.result === "W") row.wins++;
      else if (s.result === "D") row.draws++;
      else row.losses++;
      const above = s.score > median ? true : s.score < median ? false : null;
      if (above) row.expectedWins++;
      row.weeks.push({ event, aboveMedian: above, result: s.result, score: s.score, median });
    }
  }
  for (const row of rows.values()) row.luck = row.wins - row.expectedWins;
  return [...rows.values()].sort((a, b) => b.expectedWins - a.expectedWins || b.wins - a.wins || b.pointsFor - a.pointsFor);
}

function medianOf(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 0 ? (v[mid - 1] + v[mid]) / 2 : v[mid];
}

// ---------------------------------------------------------------- head to head

export interface HeadToHead {
  a: number;
  b: number;
  aWins: number;
  bWins: number;
  draws: number;
  aPoints: number;
  bPoints: number;
  matches: Score[];
}

export function headToHead(details: LeagueDetails, a: number, b: number): HeadToHead {
  const matches = scores(details).filter((s) => s.entryId === a && s.opponent === b);
  return {
    a,
    b,
    aWins: matches.filter((m) => m.result === "W").length,
    bWins: matches.filter((m) => m.result === "L").length,
    draws: matches.filter((m) => m.result === "D").length,
    aPoints: matches.reduce((s, m) => s + m.score, 0),
    bPoints: matches.reduce((s, m) => s + m.against, 0),
    matches,
  };
}

/** The next time these two play each other, if still to come. */
export function nextMeeting(details: LeagueDetails, a: number, b: number): number | null {
  const toLeague = new Map(details.league_entries.map((e) => [e.entry_id, e.id]));
  const la = toLeague.get(a);
  const lb = toLeague.get(b);
  const next = details.matches
    .filter(
      (m) =>
        !m.finished &&
        ((m.league_entry_1 === la && m.league_entry_2 === lb) || (m.league_entry_1 === lb && m.league_entry_2 === la)),
    )
    .sort((x, y) => x.event - y.event)[0];
  return next?.event ?? null;
}

// ---------------------------------------------------------------- streaks

export interface Streaks {
  entryId: number;
  /** e.g. 3 and "W" for three wins in a row right now. */
  current: number;
  currentType: Result | null;
  longestWin: number;
  longestUnbeaten: number;
  longestLoss: number;
}

export function streaks(details: LeagueDetails): Streaks[] {
  const all = scores(details);
  return details.league_entries.map((e) => {
    const results = all.filter((s) => s.entryId === e.entry_id).map((s) => s.result);
    let current = 0;
    let currentType: Result | null = null;
    for (let i = results.length - 1; i >= 0; i--) {
      if (currentType === null) {
        currentType = results[i];
        current = 1;
      } else if (results[i] === currentType) current++;
      else break;
    }
    return {
      entryId: e.entry_id,
      current,
      currentType,
      longestWin: longestRun(results, (r) => r === "W"),
      longestUnbeaten: longestRun(results, (r) => r !== "L"),
      longestLoss: longestRun(results, (r) => r === "L"),
    };
  });
}

function longestRun(results: Result[], counts: (r: Result) => boolean): number {
  let best = 0;
  let run = 0;
  for (const r of results) {
    run = counts(r) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// ---------------------------------------------------------------- records

export interface Records {
  highest: Score[];
  lowest: Score[];
  /** Winner's side of the biggest wins. */
  biggestWins: Score[];
  lowestWinning: Score[];
  highestLosing: Score[];
}

export function records(details: LeagueDetails, top = 5): Records {
  const all = scores(details);
  const byScore = [...all].sort((a, b) => b.score - a.score || a.event - b.event);
  return {
    highest: byScore.slice(0, top),
    lowest: [...byScore].reverse().slice(0, top),
    biggestWins: all
      .filter((s) => s.result === "W")
      .sort((a, b) => b.score - b.against - (a.score - a.against) || a.event - b.event)
      .slice(0, top),
    lowestWinning: all
      .filter((s) => s.result === "W")
      .sort((a, b) => a.score - b.score || a.event - b.event)
      .slice(0, top),
    highestLosing: all
      .filter((s) => s.result === "L")
      .sort((a, b) => b.score - a.score || a.event - b.event)
      .slice(0, top),
  };
}
