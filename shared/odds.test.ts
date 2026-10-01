import { describe, expect, it } from "vitest";
import leagueJson from "../fixtures/league-634-details.json";
import { seasonOdds, squadStrength } from "./odds";
import type { LeagueDetails, Player } from "./types";

const league = leagueJson as unknown as LeagueDetails;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("seasonOdds (real data)", () => {
  const odds = seasonOdds(league, { runs: 2000 });

  it("gives every manager a full set of places", () => {
    expect(odds).toHaveLength(14);
    for (const o of odds) expect(sum(o.places)).toBeCloseTo(1, 6);
    // Each place is filled exactly once per run.
    for (let p = 0; p < 14; p++) expect(sum(odds.map((o) => o.places[p]))).toBeCloseTo(1, 6);
  });

  it("names one lowest total and two lowest weeks per run", () => {
    expect(sum(odds.map((o) => o.lowestTotal))).toBeCloseTo(1, 6);
    expect(sum(odds.map((o) => o.lowestWeek))).toBeCloseTo(2, 6);
  });

  it("is repeatable with the same seed", () => {
    expect(seasonOdds(league, { runs: 500, seed: 7 })).toEqual(seasonOdds(league, { runs: 500, seed: 7 }));
  });

  it("keeps it open with 33 gameweeks left", () => {
    for (const o of odds) expect(o.places[0]).toBeLessThan(0.6);
  });
});

describe("seasonOdds (made-up league)", () => {
  const entries = [1, 2, 3, 4].map((id) => ({
    id, entry_id: id * 10, entry_name: `T${id}`, player_first_name: `M${id}`, player_last_name: "X",
    short_name: "", waiver_pick: id, joined_time: "",
  }));
  const match = (event: number, a: number, b: number, pa: number, pb: number, finished = true) => ({
    event, started: finished, finished, league_entry_1: a, league_entry_1_points: pa, league_entry_2: b, league_entry_2_points: pb,
  });
  const base = { league: league.league, league_entries: entries };

  it("is certain once the season is over", () => {
    const done: LeagueDetails = { ...base, matches: [match(1, 1, 2, 60, 20), match(1, 3, 4, 50, 40)] };
    const o = seasonOdds(done, { runs: 100 });
    expect(o.find((r) => r.entryId === 10)!.places[0]).toBe(1);
    expect(o.find((r) => r.entryId === 20)!.lowestTotal).toBe(1);
    // Lowest weeks: 20 (M2) and 40 (M4).
    expect(o.find((r) => r.entryId === 20)!.lowestWeek).toBe(1);
    expect(o.find((r) => r.entryId === 40)!.lowestWeek).toBe(1);
  });

  it("favours the stronger squad", () => {
    const open: LeagueDetails = { ...base, matches: [1, 2, 3, 4, 5, 6].flatMap((e) => [match(e, 1, 2, 0, 0, false), match(e, 3, 4, 0, 0, false)]) };
    const strength = new Map([[10, 80], [20, 40], [30, 60], [40, 60]]);
    const o = seasonOdds(open, { runs: 2000, strength });
    expect(o[0].places[0]).toBeGreaterThan(o[1].places[0]);
    expect(o[0].expected).toBeGreaterThan(o[1].expected);
  });
});

describe("squadStrength", () => {
  const p = (id: number, position: Player["position"], ppg: number, status = "a") =>
    ({ id, position, pointsPerGame: ppg, status, chanceNext: null }) as Player;

  it("adds up the best valid eleven and skips injured players", () => {
    const squad = [
      p(1, "GKP", 5), p(2, "GKP", 9),
      p(3, "DEF", 4), p(4, "DEF", 4), p(5, "DEF", 4), p(6, "DEF", 1), p(7, "DEF", 1),
      p(8, "MID", 6), p(9, "MID", 6), p(10, "MID", 6), p(11, "MID", 6), p(12, "MID", 20, "i"),
      p(13, "FWD", 7), p(14, "FWD", 7), p(15, "FWD", 7),
    ];
    // One keeper (the 9), three defenders, four fit midfielders, three forwards.
    expect(squadStrength(squad)).toBe(9 + 12 + 24 + 21);
  });
});
