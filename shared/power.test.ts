import { describe, expect, it } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import elementStatus from "../fixtures/element-status.json";
import gameweeksJson from "../fixtures/gameweeks.json";
import leagueJson from "../fixtures/league-634-details.json";
import { trimPlayers } from "../worker/index";
import { squadScore, type Gameweek } from "./gameweek";
import { Seasons } from "./moves";
import { powerAt, powerRankings, RECENT, share, squadsIn, WEIGHTS, zScores, type PowerInput } from "./power";
import { scores } from "./results";
import { computeStandings } from "./standings";
import type { LeagueDetails, PlayersPayload } from "./types";

const league = leagueJson as unknown as LeagueDetails;
const seasons = new Seasons(gameweeksJson as unknown as Gameweek[]);
const { players, rules } = JSON.parse(trimPlayers(JSON.stringify(bootstrap))) as PlayersPayload;
const positions = new Map(players.map((p) => [p.id, p.position]));
const owners = new Map(elementStatus.element_status.map((s) => [s.element, s.owner as number | null]));
const input: PowerInput = { details: league, seasons, positions, rules, owners };
const ADAM = 1412;

/** Owners as they were in one gameweek, as if nobody had moved since. */
function ownersIn(event: number): Map<number, number | null> {
  const out = new Map<number, number | null>();
  for (const [entryId, squad] of squadsIn(seasons, event)) for (const el of squad) out.set(el, entryId);
  return out;
}

describe("power rankings (league 634, GW1-5)", () => {
  const rows = powerRankings(input);

  it("ranks all 14 managers once, strongest first", () => {
    expect(rows.map((r) => r.rank)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(new Set(rows.map((r) => r.entryId)).size).toBe(14);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].power).toBeGreaterThanOrEqual(rows[i].power);
  });

  it("works out the season and recent averages from the real scores", () => {
    const table = computeStandings(league);
    const all = scores(league);
    for (const r of rows) {
      const t = table.find((x) => x.entryId === r.entryId)!;
      expect(r.season).toBeCloseTo(t.pointsFor / t.played);
      expect(r.tableRank).toBe(t.rank);
      const recent = all.filter((s) => s.entryId === r.entryId && s.event > 5 - RECENT);
      expect(recent).toHaveLength(RECENT);
      expect(r.recent).toBeCloseTo(recent.reduce((s, x) => s + x.score, 0) / RECENT);
    }
  });

  it("plays everyone against everyone each week", () => {
    for (const r of rows) expect(r.allPlay.won + r.allPlay.drawn + r.allPlay.lost).toBe(13 * 5);
    // Every win is someone else's loss.
    const sum = (k: "won" | "drawn" | "lost") => rows.reduce((s, r) => s + r.allPlay[k], 0);
    expect(sum("won")).toBe(sum("lost"));
    expect(sum("drawn") % 2).toBe(0);
  });

  it("adds up the weighted z-scores", () => {
    const z = {
      recent: zScores(rows.map((r) => r.recent)),
      season: zScores(rows.map((r) => r.season)),
      allPlay: zScores(rows.map((r) => share(r.allPlay))),
      squad: zScores(rows.map((r) => r.squad)),
    };
    rows.forEach((r, i) => {
      const expected =
        WEIGHTS.recent * z.recent[i] + WEIGHTS.season * z.season[i] + WEIGHTS.allPlay * z.allPlay[i] + WEIGHTS.squad * z.squad[i];
      expect(r.power).toBeCloseTo(expected);
    });
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("puts Adam, top of the table with the most points, near the top", () => {
    const adam = rows.find((r) => r.entryId === ADAM)!;
    expect(adam.tableRank).toBe(1);
    expect(adam.rank).toBeLessThanOrEqual(3);
  });

  it("compares with the ranking a gameweek earlier, using the squads from then", () => {
    const before = powerAt(input, 4, squadsIn(seasons, 4));
    for (const r of rows) expect(r.previousRank).toBe(before.find((b) => b.entryId === r.entryId)!.rank);
  });
});

describe("squad strength", () => {
  it("is never less than what the squad actually scored", () => {
    // In GW1 the window is just that week, and the XI they played is one of the XIs the squad could field.
    const gw1 = seasons.gameweeks[0];
    for (const r of powerAt(input, 1, squadsIn(seasons, 1))) {
      expect(r.squad).toBeGreaterThanOrEqual(squadScore(gw1, r.entryId));
      expect(r.squad).toBeGreaterThanOrEqual(r.season);
    }
  });

  it("uses the squad as it is now, so a trade counts straight away", () => {
    const asInGw5 = powerRankings({ ...input, owners: ownersIn(5) });
    const same = powerAt(input, 5, squadsIn(seasons, 5));
    expect(asInGw5.map((r) => r.squad)).toEqual(same.map((r) => r.squad));

    // Hand Adam's best scorer of the last four weeks to the bottom side.
    const adamsSquad = squadsIn(seasons, 5).get(ADAM)!;
    const recentPoints = (el: number) =>
      seasons.gameweeks.filter((g) => g.event > 5 - RECENT).reduce((s, g) => s + (g.points[el] ?? 0), 0);
    const star = [...adamsSquad].sort((a, b) => recentPoints(b) - recentPoints(a))[0];
    const bottom = asInGw5.at(-1)!.entryId;
    const traded = ownersIn(5);
    traded.set(star, bottom);
    const after = powerRankings({ ...input, owners: traded });
    const squadOf = (rs: typeof after, id: number) => rs.find((r) => r.entryId === id)!.squad;
    expect(squadOf(after, ADAM)).toBeLessThan(squadOf(asInGw5, ADAM));
    expect(squadOf(after, bottom)).toBeGreaterThan(squadOf(asInGw5, bottom));
  });
});

describe("power rankings edge cases", () => {
  it("is empty before anyone has played", () => {
    const preseason = { ...league, matches: league.matches.map((m) => ({ ...m, finished: false })) };
    expect(powerRankings({ ...input, details: preseason })).toEqual([]);
  });

  it("has no arrows after gameweek 1", () => {
    const one = { ...league, matches: league.matches.map((m) => ({ ...m, finished: m.event === 1 })) };
    const rows = powerRankings({ ...input, details: one, seasons: new Seasons(seasons.gameweeks.slice(0, 1)) });
    expect(rows).toHaveLength(14);
    for (const r of rows) expect(r.previousRank).toBeNull();
  });

  it("scores level values as average", () => {
    expect(zScores([5, 5, 5])).toEqual([0, 0, 0]);
    const z = zScores([1, 2, 3, 4]);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
    expect(Math.sqrt(z.reduce((a, b) => a + b * b, 0) / z.length)).toBeCloseTo(1);
  });
});
