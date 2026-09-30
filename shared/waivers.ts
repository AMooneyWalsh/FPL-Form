import type { Seasons } from "./moves";
import type { DraftChoice, Player, Transaction, UpcomingFixture } from "./types";

// ---------------------------------------------------------------- fixture difficulty

/**
 * 1 (easiest) to 5 (hardest) per club. Only a fallback: FPL's own ratings come
 * from the main game's fixtures API (see fixtureRun). If that can't be
 * reached, clubs are ranked by the FPL points their players have scored.
 */
export function clubDifficulty(players: Player[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const p of players) totals.set(p.teamId, (totals.get(p.teamId) ?? 0) + p.totalPoints);
  const ranked = [...totals].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const band = Math.max(1, Math.ceil(ranked.length / 5));
  return new Map(ranked.map((id, i) => [id, 5 - Math.min(4, Math.floor(i / band))]));
}

export interface FixtureRunItem {
  event: number;
  opponent: number;
  home: boolean;
  difficulty: number;
}

/** A club's next few fixtures, soonest first. Blank gameweeks just don't appear. */
export function fixtureRun(
  teamId: number,
  fixtures: UpcomingFixture[],
  difficulty: Map<number, number>,
  count = 3,
): FixtureRunItem[] {
  return fixtures
    .filter((f) => f.home === teamId || f.away === teamId)
    .sort((a, b) => a.event - b.event || (a.kickoff ?? "").localeCompare(b.kickoff ?? ""))
    .slice(0, count)
    .map((f) => {
      const home = f.home === teamId;
      const opponent = home ? f.away : f.home;
      // FPL's official rating when we have it; otherwise our estimate.
      const official = home ? f.homeDifficulty : f.awayDifficulty;
      return { event: f.event, opponent, home, difficulty: official ?? difficulty.get(opponent) ?? 3 };
    });
}

// ---------------------------------------------------------------- suggestions

/** Can't play next week (injured, suspended, gone), as opposed to a doubt. */
export function isOut(p: Player): boolean {
  return p.status === "i" || p.status === "s" || p.status === "u" || p.status === "n" || p.chanceNext === 0;
}

export interface Suggestion {
  player: Player;
  /** Higher is better. Form, season average, fixtures and fitness rolled into one. */
  rating: number;
  fixtures: FixtureRunItem[];
}

/**
 * Free agents worth a look. Rating = 60% recent form + 40% points a game,
 * nudged up to 20% for easy fixtures (down for hard), and scaled by FPL's
 * chance of playing. Players who are out, or haven't played, are left out.
 */
export function waiverSuggestions(
  players: Player[],
  owners: Map<number, number | null>,
  fixtures: UpcomingFixture[],
): Suggestion[] {
  const difficulty = clubDifficulty(players);
  return players
    .filter((p) => (owners.get(p.id) ?? null) === null && p.minutes > 0 && !isOut(p))
    .map((p) => {
      const run = fixtureRun(p.teamId, fixtures, difficulty);
      const avg = run.length ? run.reduce((s, f) => s + f.difficulty, 0) / run.length : 3;
      const chance = p.chanceNext === null ? 1 : p.chanceNext / 100;
      const rating = (0.6 * p.form + 0.4 * p.pointsPerGame) * (1 + (3 - avg) * 0.1) * chance;
      return { player: p, rating: Math.round(rating * 10) / 10, fixtures: run };
    })
    .sort((a, b) => b.rating - a.rating || b.player.totalPoints - a.player.totalPoints);
}

/**
 * The player in a squad most worth dropping for someone at `position`:
 * anyone out first, then the lowest form. Returns undefined if the squad has
 * nobody in that position.
 */
export function weakestAt(squad: Player[], position: Player["position"]): Player | undefined {
  return squad
    .filter((p) => p.position === position)
    .sort((a, b) => Number(isOut(b)) - Number(isOut(a)) || a.form - b.form || a.totalPoints - b.totalPoints)[0];
}

// ---------------------------------------------------------------- free agent signings

export interface Signing {
  id: number;
  entryId: number;
  event: number;
  added: string;
  elementIn: number;
  elementOut: number;
  /** Points he's scored in their XI since signing (until they let him go). */
  points: number;
  stillOwned: boolean;
}

/** Every accepted free agent pick-up, newest first. */
export function freeAgentSignings(transactions: Transaction[], seasons: Seasons): Signing[] {
  return transactions
    .filter((t) => t.kind === "f" && t.result === "a")
    .map((t) => {
      const spell = seasons.spell(t.element_in, t.entry, t.event);
      return {
        id: t.id,
        entryId: t.entry,
        event: t.event,
        added: t.added,
        elementIn: t.element_in,
        elementOut: t.element_out,
        points: spell.points,
        stillOwned: spell.stillOwned || t.event > seasons.lastEvent,
      };
    })
    .sort((a, b) => b.added.localeCompare(a.added));
}

// ---------------------------------------------------------------- draft day

export interface DraftDayRow {
  entryId: number;
  /** Picks FPL made for them because they didn't pick in time. */
  autoPicks: DraftChoice[];
  /** Average seconds they took per pick (auto picks included). */
  averageSeconds: number;
  slowest: { choice: DraftChoice; seconds: number } | null;
}

/**
 * How long each pick took: the gap since the previous pick. Pick 1 has no
 * previous pick, so it's left out of the timings.
 */
export function draftDay(choices: DraftChoice[], entryIds: number[]): DraftDayRow[] {
  const ordered = [...choices].sort((a, b) => a.index - b.index);
  const timed = new Map<number, { choice: DraftChoice; seconds: number }[]>();
  for (let i = 1; i < ordered.length; i++) {
    const seconds = (Date.parse(ordered[i].choice_time) - Date.parse(ordered[i - 1].choice_time)) / 1000;
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    const list = timed.get(ordered[i].entry) ?? [];
    list.push({ choice: ordered[i], seconds });
    timed.set(ordered[i].entry, list);
  }
  return entryIds
    .map((entryId) => {
      const list = timed.get(entryId) ?? [];
      const slowest = [...list].sort((a, b) => b.seconds - a.seconds)[0] ?? null;
      return {
        entryId,
        autoPicks: ordered.filter((c) => c.entry === entryId && c.was_auto),
        averageSeconds: list.length ? Math.round(list.reduce((s, x) => s + x.seconds, 0) / list.length) : 0,
        slowest,
      };
    })
    .sort((a, b) => b.averageSeconds - a.averageSeconds);
}
