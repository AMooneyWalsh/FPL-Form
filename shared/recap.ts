// The weekly recap: one finished gameweek turned into facts (who topped it,
// every result, the awards), then written up in the house style. The facts
// are kept separate from the words so a share image can reuse either.
// What's in it and how each award is picked: docs/recap.md

import { tradeVerdicts, type Seasons, type TradeVerdict } from "./moves";
import { medianOf } from "./results";
import { computeStandings, type Result } from "./standings";
import type { LeagueDetails, Trade, Transaction } from "./types";

export interface RecapSources {
  league: LeagueDetails;
  seasons: Seasons;
  /** Processed trades, with same-gameweek swap-backs already cancelled. */
  trades: Trade[];
  transactions: Transaction[];
}

/** One match. Managers are entry_ids, in FPL's order. */
export interface RecapMatch {
  home: number;
  away: number;
  homeScore: number;
  awayScore: number;
  /** null for a draw. */
  winner: number | null;
  loser: number | null;
  margin: number;
}

/** One manager's week. */
export interface RecapScore {
  entryId: number;
  score: number;
  opponent: number;
  against: number;
  result: Result;
  /** Points left on the bench (null if the gameweek's squads couldn't be loaded). */
  bench: number | null;
}

export interface Mover {
  entryId: number;
  from: number;
  to: number;
}

export interface Signing {
  entryId: number;
  element: number;
  kind: "waiver" | "free agent";
  /** Points he scored for them this gameweek, in their XI. */
  points: number;
  dropped: number;
  /** What the player they let go scored this gameweek, for whoever had him. */
  droppedPoints: number;
}

export interface RecapFacts {
  event: number;
  matches: RecapMatch[];
  /** Highest first. */
  scores: RecapScore[];
  /** The league's middle score this week. */
  median: number;
  average: number;
  /** Highest score, everyone on it, and the best score below it. */
  top: { entryIds: number[]; score: number; next: number };
  bottom: { entryIds: number[]; score: number };
  /** Ties give more than one match. Empty if every match was drawn. */
  biggestWin: RecapMatch[];
  closest: RecapMatch[];
  /** Won with the lowest winning score, if that was below the median. */
  jammiest: { matches: RecapMatch[]; score: number; outscoredBy: number } | null;
  /** Lost with the highest losing score, if that was above the median. */
  robbed: { matches: RecapMatch[]; score: number; wouldHaveBeaten: number } | null;
  bench: { entryIds: number[]; points: number; best: { entryId: number; element: number; points: number }[] } | null;
  /** Top scorer in anyone's XI, and whose. */
  player: { picks: { element: number; entryId: number }[]; points: number } | null;
  /** A player nobody owned who outscored the player of the week. */
  unowned: { element: number; points: number } | null;
  signing: { picks: Signing[]; points: number } | null;
  /** The best of the trades that took effect this gameweek, as it stood after it. */
  trade: { verdict: TradeVerdict; count: number } | null;
  table: {
    leaders: number[];
    /** Who led after the gameweek before (null in the first gameweek). */
    before: number[] | null;
    /** League points between first and second. */
    clear: number;
    /** Gameweeks in a row the leader has been top on their own. */
    weeksTop: number;
    /** Positions after this gameweek. */
    positions: Map<number, number>;
  };
  climb: { places: number; movers: Mover[] } | null;
  fall: { places: number; movers: Mover[] } | null;
  /** Runs of 3 or more wins or defeats, longest first. */
  streaks: { entryId: number; result: "W" | "L"; run: number }[];
}

/** Bench points below this aren't worth a "Bench of shame". */
const BENCH_SHAME = 5;
/** A move of one place isn't worth an award. */
const MOVE = 2;
const STREAK = 3;

/** Gameweeks where every match has finished. */
export function finishedGameweeks(details: LeagueDetails): number[] {
  const events = new Map<number, boolean>();
  for (const m of details.matches) events.set(m.event, (events.get(m.event) ?? true) && m.finished);
  return [...events.entries()]
    .filter(([, done]) => done)
    .map(([event]) => event)
    .sort((a, b) => a - b);
}

export function gameweekRecap(src: RecapSources, event: number): RecapFacts {
  const { league, seasons } = src;
  const gw = seasons.gameweeks.find((g) => g.event === event);
  const toEntry = new Map(league.league_entries.map((e) => [e.id, e.entry_id]));

  const matches: RecapMatch[] = [];
  for (const m of league.matches) {
    const home = toEntry.get(m.league_entry_1);
    const away = toEntry.get(m.league_entry_2);
    if (m.event !== event || !m.finished || home === undefined || away === undefined) continue;
    const [hs, as] = [m.league_entry_1_points, m.league_entry_2_points];
    matches.push({
      home,
      away,
      homeScore: hs,
      awayScore: as,
      winner: hs > as ? home : as > hs ? away : null,
      loser: hs > as ? away : as > hs ? home : null,
      margin: Math.abs(hs - as),
    });
  }

  const benchOf = (entryId: number) => {
    const squad = gw?.squads[entryId];
    return squad ? squad.bench.reduce((sum, el) => sum + (gw!.points[el] ?? 0), 0) : null;
  };
  const scores: RecapScore[] = matches
    .flatMap((m) => [
      { entryId: m.home, score: m.homeScore, opponent: m.away, against: m.awayScore },
      { entryId: m.away, score: m.awayScore, opponent: m.home, against: m.homeScore },
    ])
    .map((s) => ({
      ...s,
      result: s.score > s.against ? ("W" as const) : s.score < s.against ? ("L" as const) : ("D" as const),
      bench: benchOf(s.entryId),
    }))
    .sort((a, b) => b.score - a.score);
  const all = scores.map((s) => s.score);
  const median = medianOf(all);
  const top = Math.max(...all);
  const bottom = Math.min(...all);

  const won = matches.filter((m) => m.winner !== null);
  const winScore = (m: RecapMatch) => Math.max(m.homeScore, m.awayScore);
  const loseScore = (m: RecapMatch) => Math.min(m.homeScore, m.awayScore);
  const biggest = Math.max(0, ...won.map((m) => m.margin));
  const closest = Math.min(...matches.map((m) => m.margin));
  const lowestWin = Math.min(...won.map(winScore));
  const highestLoss = Math.max(...won.map(loseScore));

  return {
    event,
    matches,
    scores,
    median,
    average: Math.round(all.reduce((a, b) => a + b, 0) / Math.max(1, all.length)),
    top: {
      entryIds: scores.filter((s) => s.score === top).map((s) => s.entryId),
      score: top,
      next: Math.max(...all.filter((s) => s < top), bottom),
    },
    bottom: { entryIds: scores.filter((s) => s.score === bottom).map((s) => s.entryId), score: bottom },
    biggestWin: won.filter((m) => m.margin === biggest),
    // Only worth an award if it isn't also the biggest win (every match won by the same).
    closest: closest === biggest && won.length === matches.length ? [] : matches.filter((m) => m.margin === closest),
    jammiest:
      won.length > 0 && lowestWin < median
        ? {
            matches: won.filter((m) => winScore(m) === lowestWin),
            score: lowestWin,
            outscoredBy: all.filter((s) => s > lowestWin).length,
          }
        : null,
    robbed:
      won.length > 0 && highestLoss > median
        ? {
            matches: won.filter((m) => loseScore(m) === highestLoss),
            score: highestLoss,
            wouldHaveBeaten: all.filter((s) => s < highestLoss).length,
          }
        : null,
    bench: benchFacts(scores, gw),
    ...playerFacts(gw),
    signing: signingFacts(src.transactions, gw),
    trade: tradeFacts(src, event),
    ...tableFacts(league, event),
  };
}

type Gw = Seasons["gameweeks"][number] | undefined;

function benchFacts(scores: RecapScore[], gw: Gw): RecapFacts["bench"] {
  if (!gw) return null;
  const most = Math.max(...scores.map((s) => s.bench ?? 0));
  if (most < BENCH_SHAME) return null;
  const entryIds = scores.filter((s) => s.bench === most).map((s) => s.entryId);
  const best = entryIds.map((entryId) => {
    const bench = gw.squads[entryId].bench;
    const element = [...bench].sort((a, b) => (gw.points[b] ?? 0) - (gw.points[a] ?? 0))[0];
    return { entryId, element, points: gw.points[element] ?? 0 };
  });
  return { entryIds, points: most, best };
}

function playerFacts(gw: Gw): Pick<RecapFacts, "player" | "unowned"> {
  if (!gw) return { player: null, unowned: null };
  const played: { element: number; entryId: number; points: number }[] = [];
  const owned = new Set<number>();
  for (const [entryId, squad] of Object.entries(gw.squads)) {
    for (const el of squad.played) played.push({ element: el, entryId: Number(entryId), points: gw.points[el] ?? 0 });
    for (const el of [...squad.played, ...squad.bench]) owned.add(el);
  }
  const best = Math.max(...played.map((p) => p.points));
  if (played.length === 0 || best <= 0) return { player: null, unowned: null };
  const free = Object.entries(gw.points)
    .map(([el, points]) => ({ element: Number(el), points }))
    .filter((p) => !owned.has(p.element) && p.points > best)
    .sort((a, b) => b.points - a.points || a.element - b.element)[0];
  return {
    player: {
      picks: played.filter((p) => p.points === best).map(({ element, entryId }) => ({ element, entryId })),
      points: best,
    },
    unowned: free ?? null,
  };
}

function signingFacts(transactions: Transaction[], gw: Gw): RecapFacts["signing"] {
  if (!gw) return null;
  // Someone who signs the same player more than once in a week (dropped and
  // picked up again) only counts once: the signing that stuck.
  const latest = new Map<string, Transaction>();
  for (const t of transactions) {
    if (t.event !== gw.event || t.result !== "a") continue;
    const key = `${t.entry}:${t.element_in}`;
    const seen = latest.get(key);
    if (!seen || t.added > seen.added) latest.set(key, t);
  }
  const signings: Signing[] = [...latest.values()]
    .sort((a, b) => a.added.localeCompare(b.added))
    .map((t) => ({
      entryId: t.entry,
      element: t.element_in,
      kind: t.kind === "w" ? ("waiver" as const) : ("free agent" as const),
      points: gw.squads[t.entry]?.played.includes(t.element_in) ? (gw.points[t.element_in] ?? 0) : 0,
      dropped: t.element_out,
      droppedPoints: gw.points[t.element_out] ?? 0,
    }));
  const best = Math.max(0, ...signings.map((s) => s.points));
  if (best <= 0) return null;
  return { picks: signings.filter((s) => s.points === best), points: best };
}

function tradeFacts({ trades, seasons, transactions }: RecapSources, event: number): RecapFacts["trade"] {
  if (!seasons.gameweeks.some((g) => g.event === event)) return null;
  const known = trades.filter((t) => t.event <= event + 1);
  const theWeek = tradeVerdicts(known, seasons.upTo(event), transactions).filter((v) => v.event === event);
  if (theWeek.length === 0) return null;
  const total = (v: TradeVerdict) => v.offerer.total + v.receiver.total;
  const best = [...theWeek].sort((a, b) => b.margin - a.margin || total(b) - total(a) || a.time.localeCompare(b.time))[0];
  return { verdict: best, count: theWeek.length };
}

function tableFacts(league: LeagueDetails, event: number): Pick<RecapFacts, "table" | "climb" | "fall" | "streaks"> {
  const after = computeStandings(league, event);
  const first = event <= league.league.start_event;
  const before = first ? null : computeStandings(league, event - 1);
  const leadersOf = (rows: typeof after) => rows.filter((r) => r.rank === 1).map((r) => r.entryId);
  const leaders = leadersOf(after);
  const second = after.find((r) => r.rank > 1);

  let weeksTop = 0;
  if (leaders.length === 1) {
    for (let n = event; n >= league.league.start_event; n--) {
      const then = n === event ? leaders : leadersOf(computeStandings(league, n));
      if (then.length !== 1 || then[0] !== leaders[0]) break;
      weeksTop++;
    }
  }

  const movers: Mover[] = before
    ? after.map((r) => ({ entryId: r.entryId, from: before.find((b) => b.entryId === r.entryId)!.rank, to: r.rank }))
    : [];
  const up = Math.max(0, ...movers.map((m) => m.from - m.to));
  const down = Math.max(0, ...movers.map((m) => m.to - m.from));

  const streaks = after
    .map((r) => {
      const last = r.results.at(-1);
      let run = 0;
      for (let i = r.results.length - 1; i >= 0 && r.results[i] === last; i--) run++;
      return { entryId: r.entryId, result: last, run };
    })
    .filter((s): s is { entryId: number; result: "W" | "L"; run: number } => (s.result === "W" || s.result === "L") && s.run >= STREAK)
    .sort((a, b) => b.run - a.run);

  return {
    table: {
      leaders,
      before: before ? leadersOf(before) : null,
      clear: second ? after[0].total - second.total : 0,
      weeksTop,
      positions: new Map(after.map((r) => [r.entryId, r.rank])),
    },
    climb: up >= MOVE ? { places: up, movers: movers.filter((m) => m.from - m.to === up) } : null,
    fall: down >= MOVE ? { places: down, movers: movers.filter((m) => m.to - m.from === down) } : null,
    streaks,
  };
}

// ---------------------------------------------------------------- words
//
// House style (scripts/awards/README.md): a friendly roast. Names, not
// pronouns. One idea per sentence, short. No em dashes. The wording varies
// from week to week but is fixed for a given gameweek, so it never changes
// on a refresh.

export interface RecapNames {
  manager: (entryId: number) => string;
  player: (element: number) => string;
}

export type AwardId =
  | "top"
  | "spoon"
  | "biggest"
  | "closest"
  | "jammiest"
  | "robbed"
  | "bench"
  | "player"
  | "signing"
  | "trade"
  | "climber"
  | "faller"
  | "streak";

export interface RecapAward {
  id: AwardId;
  title: string;
  /** Who it's about. With `versus`, in pairs: [a, b, a2, b2…]. */
  entryIds: number[];
  versus?: boolean;
  /** The number that won it, e.g. "78 pts". */
  stat: string;
  tone: "good" | "bad" | "neutral";
  line: string;
}

export interface RecapWords {
  /** Two to four sentences for the top of the recap. */
  headlines: string[];
  awards: RecapAward[];
}

export function recapWords(f: RecapFacts, names: RecapNames): RecapWords {
  const n = (id: number) => names.manager(id);
  const ns = (ids: number[]) => listOf(ids.map(n));
  const p = (el: number) => names.player(el);
  /** The same choice all week, a different one next week. */
  const pick = (salt: number, options: string[]) => options[(f.event + salt) % options.length];
  const scoreOf = (id: number) => f.scores.find((s) => s.entryId === id)!;
  const sides = (m: RecapMatch) => ({
    w: m.winner!,
    l: m.loser!,
    ws: Math.max(m.homeScore, m.awayScore),
    ls: Math.min(m.homeScore, m.awayScore),
  });

  // ---- headlines: the top score, the result of the week, the top of the table
  const headlines: string[] = [];
  const [star] = f.top.entryIds;
  const alone = f.top.entryIds.length === 1;
  if (!alone) {
    headlines.push(`${ns(f.top.entryIds)} shared the week's best score, ${f.top.score}.`);
  } else if (scoreOf(star).result === "L") {
    headlines.push(`${n(star)} had the week's best score, ${f.top.score}, and still lost.`);
  } else {
    headlines.push(
      pick(0, [
        `${n(star)} topped the week with ${f.top.score}.`,
        `Nobody beat ${n(star)}'s ${f.top.score} this week.`,
        `${n(star)} led the way with ${f.top.score}.`,
      ]),
    );
  }
  if (f.biggestWin.length === 1) {
    const big = f.biggestWin[0];
    const { w, l, ws, ls } = sides(big);
    if (alone && w === star) {
      headlines.push(`${n(w)} also had the biggest win, by ${big.margin} against ${n(l)}.`);
    } else if (big.margin >= 20) {
      headlines.push(
        pick(1, [
          `${n(w)} hammered ${n(l)} ${ws} to ${ls}.`,
          `${n(l)} took a ${ws} to ${ls} hiding from ${n(w)}.`,
          `${n(w)} thrashed ${n(l)} by ${big.margin}.`,
        ]),
      );
    } else {
      headlines.push(`${n(w)} beat ${n(l)} ${ws} to ${ls}, the biggest win of the week.`);
    }
  }
  const t = f.table;
  const leader = t.leaders[0];
  if (t.leaders.length > 1) {
    headlines.push(`${ns(t.leaders)} are level at the top of the table.`);
  } else if (t.before === null) {
    headlines.push(`${n(leader)} tops the first table of the season.`);
  } else if (!(t.before.length === 1 && t.before[0] === leader)) {
    const old = t.before.filter((id) => id !== leader);
    headlines.push(
      pick(2, [`${n(leader)} goes top of the table.`, `${n(leader)} is the new leader.`, `${n(leader)} takes over at the top.`]) +
        (old.length === 1 ? ` ${n(old[0])} drops to ${ordinal(t.positions.get(old[0])!)}.` : ""),
    );
  } else if (t.weeksTop >= 3) {
    headlines.push(
      pick(2, [
        `${n(leader)} has been top for ${t.weeksTop} weeks running.`,
        `${n(leader)} stays top for a ${ordinal(t.weeksTop)} week in a row.`,
      ]),
    );
  } else {
    headlines.push(
      t.clear === 0
        ? `${n(leader)} stays top, but only on points scored.`
        : `${n(leader)} stays top, ${t.clear} ${t.clear === 1 ? "point" : "points"} clear.`,
    );
  }
  const longest = f.streaks[0];
  if (longest && longest.run >= 4 && f.streaks.filter((s) => s.run === longest.run).length === 1) {
    headlines.push(`${n(longest.entryId)} has now ${longest.result === "W" ? "won" : "lost"} ${longest.run} in a row.`);
  } else if (f.climb && f.climb.places >= 4 && f.climb.movers.length === 1) {
    const m = f.climb.movers[0];
    headlines.push(`${n(m.entryId)} jumped ${f.climb.places} places to ${ordinal(m.to)}.`);
  }

  // ---- awards
  const awards: RecapAward[] = [];

  {
    const ids = f.top.entryIds;
    const s = f.top.score;
    const me = scoreOf(ids[0]);
    let line: string;
    if (ids.length > 1) line = `${ns(ids)} ${both(ids)} scored ${s}.` + (s - f.top.next >= 10 ? " Nobody else got near." : "");
    else if (me.result === "L") line = `${n(me.entryId)} scored ${s} and lost to ${n(me.opponent)} anyway. Brutal.`;
    else if (me.result === "D") line = `${n(me.entryId)} scored ${s} and only drew with ${n(me.opponent)}.`;
    else
      line = pick(3, [
        `${n(me.entryId)} scored ${s}. Next best was ${f.top.next}.`,
        `${n(me.entryId)} put up ${s}. The league average was ${f.average}.`,
        `${n(me.entryId)} hit ${s} and beat ${n(me.opponent)} by ${s - me.against}.`,
      ]);
    awards.push({ id: "top", title: "Manager of the week", entryIds: ids, stat: `${s} pts`, tone: "good", line });
  }
  {
    const ids = f.bottom.entryIds;
    const s = f.bottom.score;
    const me = scoreOf(ids[0]);
    let line: string;
    if (ids.length > 1) line = `${ns(ids)} ${both(ids)} scraped ${s}.`;
    else if (me.result === "W") line = `${n(me.entryId)} scored ${s}, the lowest of the week, and still beat ${n(me.opponent)}. Somehow.`;
    else if (me.result === "D") line = `${n(me.entryId)} scored ${s}, the lowest of the week, and somehow drew.`;
    else
      line = pick(4, [
        `${n(me.entryId)} managed just ${s}.`,
        `${n(me.entryId)} scored ${s}. ${n(me.opponent)} barely had to turn up.`,
        `${n(me.entryId)} posted ${s}, ${f.average - s} below the league average.`,
      ]);
    awards.push({ id: "spoon", title: "Wooden spoon", entryIds: ids, stat: `${s} pts`, tone: "bad", line });
  }
  if (f.biggestWin.length > 0) {
    const lines = f.biggestWin.map((m, i) => {
      const { w, l, ws, ls } = sides(m);
      return pick(5 + i, [
        `${n(w)} beat ${n(l)} ${ws} to ${ls}.`,
        `${n(w)} ${ws}, ${n(l)} ${ls}. Not close.`,
        `${n(l)} lost ${ls} to ${ws}. ${n(w)} showed no mercy.`,
      ]);
    });
    awards.push({
      id: "biggest",
      title: "Biggest win",
      entryIds: f.biggestWin.map((m) => m.winner!),
      stat: `By ${f.biggestWin[0].margin}`,
      tone: "good",
      line: lines.join(" "),
    });
  }
  if (f.closest.length > 0) {
    const lines = f.closest.map((m, i) => {
      if (m.winner === null) return `${n(m.home)} and ${n(m.away)} drew ${m.homeScore} each.`;
      const { w, l, ws, ls } = sides(m);
      const bench = scoreOf(l).bench;
      return (
        pick(6 + i, [`${n(w)} edged ${n(l)} ${ws} to ${ls}.`, `${n(w)} got past ${n(l)} ${ws} to ${ls}.`]) +
        (bench !== null && bench > m.margin ? ` ${n(l)} had ${bench} on the bench.` : "")
      );
    });
    const margin = f.closest[0].margin;
    awards.push({
      id: "closest",
      title: "Closest match",
      entryIds: f.closest.flatMap((m) => (m.winner === null ? [m.home, m.away] : [m.winner, m.loser!])),
      versus: true,
      stat: margin === 0 ? "Draw" : `By ${margin}`,
      tone: "neutral",
      line: lines.join(" "),
    });
  }
  if (f.jammiest) {
    const j = f.jammiest;
    const lines = j.matches.map((m) => {
      const { w, l, ls } = sides(m);
      return `${n(w)} beat ${n(l)} with just ${j.score}. ${n(l)} managed ${ls}.`;
    });
    awards.push({
      id: "jammiest",
      title: "Jammiest win",
      entryIds: j.matches.map((m) => m.winner!),
      stat: `${j.score} pts`,
      tone: "neutral",
      line: `${lines.join(" ")} ${j.outscoredBy} other ${j.outscoredBy === 1 ? "team" : "teams"} scored more.`,
    });
  }
  if (f.robbed) {
    const r = f.robbed;
    const lines = r.matches.map((m) => {
      const { w, l, ws } = sides(m);
      return `${n(l)} scored ${r.score} and lost to ${n(w)}'s ${ws}.`;
    });
    awards.push({
      id: "robbed",
      title: "Most robbed",
      entryIds: r.matches.map((m) => m.loser!),
      stat: `${r.score} pts`,
      tone: "bad",
      line: `${lines.join(" ")} ${r.score} would have beaten ${r.wouldHaveBeaten} other ${r.wouldHaveBeaten === 1 ? "team" : "teams"}.`,
    });
  }
  if (f.bench) {
    const b = f.bench;
    const ids = b.entryIds;
    let line: string;
    if (ids.length > 1) {
      line = `${ns(ids)} ${both(ids)} left ${b.points} points on the bench.`;
    } else {
      const me = scoreOf(ids[0]);
      line = pick(7, [
        `${n(ids[0])} left ${b.points} points on the bench.`,
        `${n(ids[0])} benched ${b.points} points.`,
        `${b.points} points sat on ${n(ids[0])}'s bench.`,
      ]);
      if (me.result === "L" && me.against - me.score < b.points) line += ` ${n(ids[0])} lost by ${me.against - me.score}.`;
      else if (b.best[0].points > 0) line += ` ${p(b.best[0].element)} got ${b.best[0].points} of them.`;
    }
    awards.push({ id: "bench", title: "Bench of shame", entryIds: ids, stat: `${b.points} pts`, tone: "bad", line });
  }
  if (f.player) {
    const pl = f.player;
    const owners = [...new Set(pl.picks.map((x) => x.entryId))];
    let line: string;
    if (pl.picks.length > 1) {
      line = `${listOf(pl.picks.map((x) => `${p(x.element)} for ${n(x.entryId)}`))}, ${pl.points} each.`;
    } else {
      const { element, entryId } = pl.picks[0];
      line = pick(8, [`${p(element)} got ${pl.points} for ${n(entryId)}.`, `${n(entryId)} had ${p(element)}, who got ${pl.points}.`]);
      if (scoreOf(entryId).result === "L") line += ` ${n(entryId)} still lost.`;
    }
    if (f.unowned) line += ` Free agent ${p(f.unowned.element)} got ${f.unowned.points}. Nobody had ${p(f.unowned.element)}.`;
    awards.push({
      id: "player",
      title: "Player of the week",
      entryIds: owners,
      stat: `${pl.points} pts`,
      tone: "good",
      line,
    });
  }
  if (f.signing) {
    const sg = f.signing;
    let line: string;
    if (sg.picks.length > 1) {
      line = `${listOf(sg.picks.map((s) => `${p(s.element)} for ${n(s.entryId)}`))}, ${sg.points} each.`;
    } else {
      const s = sg.picks[0];
      const how = s.kind === "waiver" ? "on waivers" : "as a free agent";
      line =
        pick(9, [
          `${n(s.entryId)} picked up ${p(s.element)} ${how}. ${p(s.element)} got ${s.points} straight away.`,
          `${n(s.entryId)} signed ${p(s.element)} ${how}. ${p(s.element)} paid off with ${s.points}.`,
        ]) + ` Out went ${p(s.dropped)}, who got ${s.droppedPoints}.`;
    }
    awards.push({
      id: "signing",
      title: "Signing of the week",
      entryIds: [...new Set(sg.picks.map((s) => s.entryId))],
      stat: `${sg.points} pts`,
      tone: "good",
      line,
    });
  }
  if (f.trade) {
    const v = f.trade.verdict;
    const [a, b] = [v.offerer, v.receiver];
    const got = (side: typeof a) => shortList(side.received.map((x) => p(x.element)));
    const line =
      `${n(a.entryId)} got ${got(a)} from ${n(b.entryId)} for ${got(b)}.` +
      ` Week one: ${n(a.entryId)} ${Math.round(a.total)}, ${n(b.entryId)} ${Math.round(b.total)}.` +
      (f.trade.count > 1 ? ` The best of ${f.trade.count} trades this week.` : "");
    awards.push({
      id: "trade",
      title: "Trade of the week",
      entryIds: [a.entryId, b.entryId],
      versus: true,
      stat: v.winner === null ? "Level" : `${n(v.winner)} +${v.margin}`,
      tone: v.winner === null ? "neutral" : "good",
      line,
    });
  }
  for (const [move, up] of [
    [f.climb, true],
    [f.fall, false],
  ] as const) {
    if (!move) continue;
    const ids = move.movers.map((m) => m.entryId);
    const k = move.places;
    const line =
      move.movers.length > 2
        ? `${ns(ids)} all went ${up ? "up" : "down"} ${k}.`
        : move.movers
            .map((m, i) =>
              pick(
                10 + i,
                up
                  ? [`${n(m.entryId)} climbed from ${ordinal(m.from)} to ${ordinal(m.to)}.`, `${n(m.entryId)} moved up ${k} to ${ordinal(m.to)}.`, `Up ${k} for ${n(m.entryId)}, now ${ordinal(m.to)}.`]
                  : [`${n(m.entryId)} slid from ${ordinal(m.from)} to ${ordinal(m.to)}.`, `${n(m.entryId)} dropped ${k} to ${ordinal(m.to)}.`, `Down ${k} for ${n(m.entryId)}, now ${ordinal(m.to)}.`],
              ),
            )
            .join(" ");
    awards.push({
      id: up ? "climber" : "faller",
      title: up ? "Climber" : "Faller",
      entryIds: ids,
      stat: `${up ? "Up" : "Down"} ${k} ${k === 1 ? "place" : "places"}`,
      tone: up ? "good" : "bad",
      line,
    });
  }
  // One card for winning runs, one for losing runs, led by the longest.
  for (const result of ["W", "L"] as const) {
    const runs = f.streaks.filter((s) => s.result === result);
    if (runs.length === 0) continue;
    const run = runs[0].run;
    const ids = runs.filter((s) => s.run === run).map((s) => s.entryId);
    const rest = runs.filter((s) => s.run < run);
    const verb = result === "W" ? "won" : "lost";
    let line: string;
    if (ids.length > 1) line = `${ns(ids)} have ${both(ids)} ${verb} ${run} in a row.`;
    else {
      const who = n(ids[0]);
      line =
        result === "W"
          ? pick(12, [`${who} has won ${run} on the bounce.`, `${who} has won ${run} in a row. Somebody stop ${who}.`])
          : pick(12, [`${who} has lost ${run} in a row.`, `${run} defeats in a row for ${who}. Someone check on ${who}.`]);
    }
    if (rest.length > 0) line += ` Also on a run: ${listOf(rest.map((s) => `${n(s.entryId)} (${s.run})`))}.`;
    awards.push({
      id: "streak",
      title: "Streak watch",
      entryIds: ids,
      stat: result === "W" ? `${run} wins` : `${run} defeats`,
      tone: result === "W" ? "good" : "bad",
      line,
    });
  }

  // A name like "Bruno G." can end a sentence; don't double the full stop.
  const tidy = (s: string) => s.replace(/\.\./g, ".");
  return { headlines: headlines.map(tidy), awards: awards.map((a) => ({ ...a, line: tidy(a.line) })) };
}

/** "both" for two, "all" for more. */
function both(items: unknown[]): string {
  return items.length === 2 ? "both" : "all";
}

/** "Ben", "Ben and Daire", "Ben, Daire and Ross". */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Up to three names, then "and 2 more". */
function shortList(items: string[]): string {
  return items.length <= 3 ? listOf(items) : `${items.slice(0, 2).join(", ")} and ${items.length - 2} more`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
