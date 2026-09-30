// Draft analysis: how every pick has aged, the table if nobody had changed
// their squad, where each squad's points come from, and a hindsight redraft.
// Explained in docs/draft-analysis.md.

import type { Gameweek } from "./gameweek";
import { playerJourney, type HowAcquired, type Seasons } from "./moves";
import { computeStandings, type StandingRow } from "./standings";
import type { DraftChoice, LeagueDetails, Player, SquadRules, Trade, Transaction } from "./types";

type Position = Player["position"];
const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];

/** Every player's FPL points across the gameweeks played so far. */
export function seasonPoints(seasons: Seasons): Map<number, number> {
  const totals = new Map<number, number>();
  for (const gw of seasons.gameweeks) {
    for (const [id, pts] of Object.entries(gw.points)) totals.set(Number(id), (totals.get(Number(id)) ?? 0) + pts);
  }
  return totals;
}

// ---------------------------------------------------------------- picks

export interface PickReport {
  /** Overall pick number. */
  index: number;
  round: number;
  entryId: number;
  element: number;
  wasAuto: boolean;
  /** All his FPL points this season, whoever owned him. */
  points: number;
  /** Where his points rank among the drafted players (1 = most). */
  pointsRank: number;
  /** Pick number minus points rank: positive = steal, negative = bust. */
  value: number;
  /** Points he scored in the drafter's XI before they let him go. */
  forDrafter: number;
  /** Still with the manager who drafted him. */
  stillThere: boolean;
}

export function pickReports(draft: DraftChoice[], seasons: Seasons): PickReport[] {
  const totals = seasonPoints(seasons);
  const byPoints = [...draft].sort((a, b) => (totals.get(b.element) ?? 0) - (totals.get(a.element) ?? 0) || a.index - b.index);
  const rank = new Map(byPoints.map((c, i) => [c.element, i + 1]));
  const first = seasons.gameweeks[0]?.event ?? 1;
  return [...draft]
    .sort((a, b) => a.index - b.index)
    .map((c) => {
      const spell = seasons.spell(c.element, c.entry, first);
      return {
        index: c.index,
        round: c.round,
        entryId: c.entry,
        element: c.element,
        wasAuto: c.was_auto,
        points: totals.get(c.element) ?? 0,
        pointsRank: rank.get(c.element)!,
        value: c.index - rank.get(c.element)!,
        forDrafter: spell.points,
        stillThere: spell.stillOwned,
      };
    });
}

export interface DraftGrade {
  entryId: number;
  /** Total season points of all 15 picks, whoever owns them now. */
  points: number;
  /** Sum of pick values (positive = got more than their slots suggested). */
  value: number;
  best: PickReport;
  worst: PickReport;
  /** Picks still in their squad. */
  kept: number;
}

export function draftGrades(reports: PickReport[]): DraftGrade[] {
  const byEntry = new Map<number, PickReport[]>();
  for (const r of reports) byEntry.set(r.entryId, [...(byEntry.get(r.entryId) ?? []), r]);
  return [...byEntry.entries()]
    .map(([entryId, picks]) => {
      const byValue = [...picks].sort((a, b) => b.value - a.value);
      return {
        entryId,
        points: picks.reduce((s, p) => s + p.points, 0),
        value: picks.reduce((s, p) => s + p.value, 0),
        best: byValue[0],
        worst: byValue.at(-1)!,
        kept: picks.filter((p) => p.stillThere).length,
      };
    })
    .sort((a, b) => b.points - a.points || b.value - a.value);
}

// ---------------------------------------------------------------- draft-only table

/**
 * The highest-scoring legal XI from a squad for one gameweek. Used for the
 * draft-only table, where nobody's real team choices exist, so every manager
 * gets the same treatment: their best possible XI from the 15 they drafted.
 */
export function bestXIScore(squad: number[], gw: Gameweek, positions: Map<number, Position>, rules: SquadRules): number {
  const pool = new Map<Position, number[]>(POSITIONS.map((p) => [p, []]));
  for (const el of squad) {
    const pos = positions.get(el);
    if (pos) pool.get(pos)!.push(gw.points[el] ?? 0);
  }
  for (const list of pool.values()) list.sort((a, b) => b - a);

  let total = 0;
  let slots = rules.play;
  const used = new Map<Position, number>();
  // Fill each position's minimum first...
  for (const pos of POSITIONS) {
    const take = pool.get(pos)!.splice(0, rules.minPlay[pos]);
    total += take.reduce((s, x) => s + x, 0);
    used.set(pos, take.length);
    slots -= take.length;
  }
  // ...then the best of the rest, within each position's maximum.
  const rest = POSITIONS.flatMap((pos) => pool.get(pos)!.map((pts) => ({ pos, pts }))).sort((a, b) => b.pts - a.pts);
  for (const { pos, pts } of rest) {
    if (slots === 0) break;
    if (used.get(pos)! >= rules.maxPlay[pos]) continue;
    used.set(pos, used.get(pos)! + 1);
    total += pts;
    slots--;
  }
  return total;
}

/** The H2H table if every manager had kept their 15 draft picks all season. */
export function draftOnlyTable(
  details: LeagueDetails,
  draft: DraftChoice[],
  seasons: Seasons,
  positions: Map<number, Position>,
  rules: SquadRules,
): StandingRow[] {
  const squads = new Map<number, number[]>();
  for (const c of draft) squads.set(c.entry, [...(squads.get(c.entry) ?? []), c.element]);
  const toEntry = new Map(details.league_entries.map((e) => [e.id, e.entry_id]));
  const score = (leagueEntryId: number, event: number) => {
    const gw = seasons.gameweeks.find((g) => g.event === event);
    const squad = squads.get(toEntry.get(leagueEntryId) ?? -1);
    return gw && squad ? bestXIScore(squad, gw, positions, rules) : 0;
  };
  const matches = details.matches
    .filter((m) => m.finished && seasons.gameweeks.some((g) => g.event === m.event))
    .map((m) => ({
      ...m,
      league_entry_1_points: score(m.league_entry_1, m.event),
      league_entry_2_points: score(m.league_entry_2, m.event),
    }));
  return computeStandings({ ...details, matches });
}

// ---------------------------------------------------------------- squad origins

export interface Origins {
  entryId: number;
  /** Points that counted for them this season, split by how they got the player. */
  points: Record<HowAcquired, number>;
  /** Their current 15, split the same way. */
  squad: Record<HowAcquired, number>;
}

const EMPTY = (): Record<HowAcquired, number> => ({ draft: 0, waiver: 0, "free agent": 0, trade: 0, unknown: 0 });

export function squadOrigins(
  entryIds: number[],
  seasons: Seasons,
  moves: { transactions: Transaction[]; trades: Trade[]; draft: DraftChoice[] },
): Origins[] {
  const rows = new Map<number, Origins>(entryIds.map((id) => [id, { entryId: id, points: EMPTY(), squad: EMPTY() }]));
  const everOwned = new Set<number>();
  for (const gw of seasons.gameweeks) {
    for (const s of Object.values(gw.squads)) [...s.played, ...s.bench].forEach((id) => everOwned.add(id));
  }
  const last = seasons.lastEvent;
  for (const element of everOwned) {
    for (const stint of playerJourney(element, seasons, moves)) {
      const row = rows.get(stint.entryId);
      if (!row) continue;
      row.points[stint.how] += stint.points;
      if (stint.to === last) row.squad[stint.how]++;
    }
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------- hindsight redraft

export interface RedraftPick {
  index: number;
  round: number;
  entryId: number;
  /** Who they actually took with this pick. */
  actual: number;
  /** Who they'd take knowing this season's points so far. */
  hindsight: number;
  hindsightPoints: number;
}

/**
 * Re-runs the draft in the same snake order, each manager taking the
 * highest-scoring player still available who fits their squad (2 GKP,
 * 5 DEF, 5 MID, 3 FWD). Every player in the game is available, not just the
 * ones who were drafted.
 */
export function hindsightRedraft(
  draft: DraftChoice[],
  seasons: Seasons,
  players: Player[],
  rules: SquadRules,
): RedraftPick[] {
  const totals = seasonPoints(seasons);
  const pool = [...players].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.draftRank - b.draftRank);
  const taken = new Set<number>();
  const counts = new Map<number, Record<Position, number>>();
  return [...draft]
    .sort((a, b) => a.index - b.index)
    .map((c) => {
      const mine = counts.get(c.entry) ?? { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
      counts.set(c.entry, mine);
      const pick = pool.find((p) => !taken.has(p.id) && mine[p.position] < rules.select[p.position]);
      if (!pick) throw new Error("Ran out of players in the redraft");
      taken.add(pick.id);
      mine[pick.position]++;
      return {
        index: c.index,
        round: c.round,
        entryId: c.entry,
        actual: c.element,
        hindsight: pick.id,
        hindsightPoints: totals.get(pick.id) ?? 0,
      };
    });
}
