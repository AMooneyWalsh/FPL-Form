import { describe, expect, it } from "vitest";
import leagueJson from "../fixtures/league-634-details.json";
import { fixtureLuck, headToHead, lastFinishedEvent, nextMeeting, positionsByGameweek, records, scores, streaks } from "./results";
import { computeStandings } from "./standings";
import type { LeagueDetails, Match } from "./types";

const league = leagueJson as unknown as LeagueDetails;
const ADAM = 1412;

describe("scores (real data)", () => {
  it("has both sides of all 35 finished matches", () => {
    expect(scores(league)).toHaveLength(70);
    expect(lastFinishedEvent(league)).toBe(5);
  });

  it("can be limited to a range of gameweeks", () => {
    const s = scores(league, 4, 5);
    expect(s).toHaveLength(28);
    expect(s.every((x) => x.event >= 4)).toBe(true);
  });
});

describe("form table", () => {
  it("counts only the chosen gameweeks", () => {
    const lastTwo = computeStandings(league, 5, 4);
    expect(lastTwo.every((r) => r.played === 2)).toBe(true);
  });
});

describe("positions by gameweek", () => {
  it("gives every manager a position every week, ending on the real table", () => {
    const weeks = positionsByGameweek(league);
    expect(weeks).toHaveLength(5);
    for (const w of weeks) expect(w.positions.size).toBe(14);
    const final = computeStandings(league);
    for (const r of final) expect(weeks[4].positions.get(r.entryId)).toBe(r.rank);
  });
});

describe("fixture luck", () => {
  const luck = fixtureLuck(league);

  it("agrees with the real results", () => {
    const table = computeStandings(league);
    for (const row of luck) {
      const real = table.find((r) => r.entryId === row.entryId)!;
      expect([row.wins, row.draws, row.losses, row.pointsFor, row.pointsAgainst]).toEqual([
        real.won,
        real.drawn,
        real.lost,
        real.pointsFor,
        real.pointsAgainst,
      ]);
      expect(row.luck).toBe(row.wins - row.expectedWins);
      expect(row.weeks).toHaveLength(5);
    }
  });

  it("expects at most half the league to win each week", () => {
    // 14 scores: the median sits between the 7th and 8th, so 7 are above it
    // unless scores tie across the middle.
    for (let gw = 1; gw <= 5; gw++) {
      const above = luck.filter((r) => r.weeks.find((w) => w.event === gw)!.aboveMedian === true).length;
      expect(above).toBeLessThanOrEqual(7);
      expect(above).toBeGreaterThanOrEqual(6);
    }
  });

  it("counts a score above the median as an expected win, and exactly the median as neither", () => {
    const m = (a: number, pa: number, b: number, pb: number): Match => ({
      event: 1,
      started: true,
      finished: true,
      league_entry_1: a,
      league_entry_1_points: pa,
      league_entry_2: b,
      league_entry_2_points: pb,
    });
    const tiny: LeagueDetails = {
      ...league,
      league_entries: [1, 2, 3, 4].map((id) => ({ ...league.league_entries[0], id, entry_id: id * 10 })),
      // Scores 10, 20, 20, 30: median 20.
      matches: [m(1, 10, 2, 20), m(3, 20, 4, 30)],
    };
    const rows = fixtureLuck(tiny);
    const week = (id: number) => rows.find((r) => r.entryId === id)!.weeks[0].aboveMedian;
    expect([week(10), week(20), week(30), week(40)]).toEqual([false, null, null, true]);
    // Manager 20 won with a median score: a win they weren't "expected" to get.
    expect(rows.find((r) => r.entryId === 20)!.luck).toBe(1);
  });
});

describe("head to head", () => {
  it("adds up both sides of every meeting", () => {
    const [first] = scores(league).filter((s) => s.entryId === ADAM);
    const h = headToHead(league, ADAM, first.opponent);
    expect(h.matches).toHaveLength(1);
    expect(h.aWins + h.bWins + h.draws).toBe(1);
    expect(h.aPoints).toBe(first.score);
    expect(h.bPoints).toBe(first.against);
    expect(headToHead(league, first.opponent, ADAM).bPoints).toBe(first.score);
  });

  it("knows when two managers meet next", () => {
    const [first] = scores(league).filter((s) => s.entryId === ADAM);
    const next = nextMeeting(league, ADAM, first.opponent);
    expect(next).toBeGreaterThan(5);
  });
});

describe("streaks", () => {
  it("reads current and longest runs from results", () => {
    const table = computeStandings(league);
    for (const s of streaks(league)) {
      const results = table.find((r) => r.entryId === s.entryId)!.results;
      expect(s.currentType).toBe(results.at(-1));
      expect(s.longestUnbeaten).toBeGreaterThanOrEqual(s.longestWin);
      expect(s.longestWin + s.longestLoss).toBeLessThanOrEqual(results.length);
    }
  });

  it("gets Adam's WWWLW right: current 1 win, best 3 wins, 3 unbeaten, 1 loss", () => {
    const adam = streaks(league).find((s) => s.entryId === ADAM)!;
    expect(adam).toMatchObject({ current: 1, currentType: "W", longestWin: 3, longestUnbeaten: 3, longestLoss: 1 });
  });
});

describe("records", () => {
  const r = records(league);

  it("finds the highest and lowest scores", () => {
    const all = scores(league).map((s) => s.score);
    expect(r.highest[0].score).toBe(Math.max(...all));
    expect(r.lowest[0].score).toBe(Math.min(...all));
  });

  it("only lists wins among biggest wins and lowest winning scores, and losses among highest losing", () => {
    expect(r.biggestWins.every((s) => s.result === "W")).toBe(true);
    expect(r.lowestWinning.every((s) => s.result === "W")).toBe(true);
    expect(r.highestLosing.every((s) => s.result === "L")).toBe(true);
    expect(r.biggestWins[0].score - r.biggestWins[0].against).toBeGreaterThanOrEqual(
      r.biggestWins[1].score - r.biggestWins[1].against,
    );
  });
});
