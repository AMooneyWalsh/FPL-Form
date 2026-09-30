import type { LeagueDetails, LeagueEntry } from "./types";

export type Result = "W" | "D" | "L";

export interface StandingRow {
  rank: number;
  leagueEntryId: number;
  entryId: number;
  teamName: string;
  managerName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  /** League points: 3 for a win, 1 for a draw. */
  total: number;
  /** Results in gameweek order, oldest first. */
  results: Result[];
}

const WIN = 3;
const DRAW = 1;

export function managerName(e: LeagueEntry): string {
  return `${e.player_first_name} ${e.player_last_name}`;
}

/** Short names for tight spaces: first name, plus surname initial when two
 * managers share a first name. Keyed by entry_id. */
export function managerLabels(entries: LeagueEntry[]): Map<number, string> {
  const first = (e: LeagueEntry) => capitalise(e.player_first_name.trim());
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(first(e).toLowerCase(), (counts.get(first(e).toLowerCase()) ?? 0) + 1);
  return new Map(
    entries.map((e) => {
      const f = first(e);
      const clash = (counts.get(f.toLowerCase()) ?? 0) > 1;
      return [e.entry_id, clash ? `${f} ${e.player_last_name.trim().charAt(0).toUpperCase()}` : f];
    }),
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Builds the H2H table from finished matches. We work this out ourselves
 * because the API's `matches_played` and `winning_league_entry` are wrong.
 * Ties on league points are split by total points scored, as FPL Draft does.
 */
export function computeStandings(details: LeagueDetails, upToEvent = Infinity): StandingRow[] {
  const rows = new Map<number, StandingRow>();
  for (const e of details.league_entries) {
    rows.set(e.id, {
      rank: 0,
      leagueEntryId: e.id,
      entryId: e.entry_id,
      teamName: e.entry_name,
      managerName: managerName(e),
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      total: 0,
      results: [],
    });
  }

  const finished = details.matches
    .filter((m) => m.finished && m.event <= upToEvent)
    .sort((a, b) => a.event - b.event);

  for (const m of finished) {
    const a = rows.get(m.league_entry_1);
    const b = rows.get(m.league_entry_2);
    if (!a || !b) continue;
    record(a, m.league_entry_1_points, m.league_entry_2_points);
    record(b, m.league_entry_2_points, m.league_entry_1_points);
  }

  const sorted = [...rows.values()].sort(
    (x, y) =>
      y.total - x.total ||
      y.pointsFor - x.pointsFor ||
      x.teamName.localeCompare(y.teamName),
  );
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    const tied = prev && prev.total === row.total && prev.pointsFor === row.pointsFor;
    row.rank = tied ? prev.rank : i + 1;
  });
  return sorted;
}

function record(row: StandingRow, scored: number, conceded: number) {
  row.played++;
  row.pointsFor += scored;
  row.pointsAgainst += conceded;
  if (scored > conceded) {
    row.won++;
    row.total += WIN;
    row.results.push("W");
  } else if (scored < conceded) {
    row.lost++;
    row.results.push("L");
  } else {
    row.drawn++;
    row.total += DRAW;
    row.results.push("D");
  }
}
