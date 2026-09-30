import { describe, expect, it } from "vitest";
import details from "../fixtures/league-634-details.json";
import { computeStandings } from "./standings";
import type { LeagueDetails } from "./types";

interface ApiStanding {
  league_entry: number;
  rank: number;
  matches_won: number;
  matches_drawn: number;
  matches_lost: number;
  points_for: number;
  points_against: number;
  total: number;
}

const league = details as unknown as LeagueDetails;
const apiStandings = (details as unknown as { standings: ApiStanding[] }).standings;

describe("computeStandings (league 634 after GW5)", () => {
  const rows = computeStandings(league);

  it("has all 14 managers", () => {
    expect(rows).toHaveLength(14);
  });

  it("matches FPL's own won/drawn/lost, points and ranks", () => {
    for (const api of apiStandings) {
      const row = rows.find((r) => r.leagueEntryId === api.league_entry)!;
      expect(row, `entry ${api.league_entry}`).toMatchObject({
        rank: api.rank,
        won: api.matches_won,
        drawn: api.matches_drawn,
        lost: api.matches_lost,
        pointsFor: api.points_for,
        pointsAgainst: api.points_against,
        total: api.total,
      });
    }
  });

  it("counts matches played correctly (the API says 38)", () => {
    expect(rows.every((r) => r.played === 5)).toBe(true);
  });

  it("maps league entry ids to team entry ids", () => {
    const jack = rows.find((r) => r.leagueEntryId === 1849)!;
    expect(jack.entryId).toBe(1848);
  });

  it("can show the table as it stood after an earlier gameweek", () => {
    const afterGw1 = computeStandings(league, 1);
    expect(afterGw1.every((r) => r.played === 1)).toBe(true);
    expect(afterGw1[0].results).toEqual(["W"]);
  });
});
