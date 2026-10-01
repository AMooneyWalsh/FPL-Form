import { describe, expect, it } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import choicesJson from "../fixtures/choices.json";
import gameweeksJson from "../fixtures/gameweeks.json";
import leagueJson from "../fixtures/league-634-details.json";
import tradesJson from "../fixtures/trades.json";
import transactionsJson from "../fixtures/transactions.json";
import { trimPlayers } from "../worker/index";
import { bestXIScore, draftGrades, draftOnlyTable, hindsightRedraft, pickReports, seasonPoints, squadOrigins } from "./draft";
import type { Gameweek } from "./gameweek";
import { cancelReversals, Seasons } from "./moves";
import { computeStandings } from "./standings";
import type { DraftChoice, LeagueDetails, Player, PlayersPayload, SquadRules, Trade, Transaction } from "./types";

const seasons = new Seasons(gameweeksJson as unknown as Gameweek[]);
const draft = choicesJson.choices as DraftChoice[];
const league = leagueJson as unknown as LeagueDetails;
const { players, rules } = JSON.parse(trimPlayers(JSON.stringify(bootstrap))) as PlayersPayload;
const positions = new Map(players.map((p) => [p.id, p.position]));
const entryIds = league.league_entries.map((e) => e.entry_id);

describe("pick reports (real draft)", () => {
  const reports = pickReports(draft, seasons);

  it("covers all 210 picks in order, ranking each by points", () => {
    expect(reports.map((r) => r.index)).toEqual(Array.from({ length: 210 }, (_, i) => i + 1));
    expect(new Set(reports.map((r) => r.pointsRank)).size).toBe(210);
  });

  it("values each pick as its slot minus its points rank, so they balance out", () => {
    for (const r of reports) expect(r.value).toBe(r.index - r.pointsRank);
    expect(reports.reduce((s, r) => s + r.value, 0)).toBe(0);
  });

  it("ranks the top scorer first", () => {
    const top = reports.find((r) => r.pointsRank === 1)!;
    expect(top.points).toBe(Math.max(...reports.map((r) => r.points)));
  });

  it("grades all 14 managers on their 15 picks", () => {
    const grades = draftGrades(reports);
    expect(grades).toHaveLength(14);
    for (const g of grades) expect(g.kept).toBeLessThanOrEqual(15);
    expect(grades.reduce((s, g) => s + g.value, 0)).toBe(0);
  });
});

describe("bestXIScore", () => {
  const rules: SquadRules = {
    play: 11,
    select: { GKP: 2, DEF: 5, MID: 5, FWD: 3 },
    minPlay: { GKP: 1, DEF: 3, MID: 2, FWD: 1 },
    maxPlay: { GKP: 1, DEF: 5, MID: 5, FWD: 3 },
  };
  // ids 1-2 GKP, 3-7 DEF, 8-12 MID, 13-15 FWD
  const pos = new Map<number, Player["position"]>([
    ...[1, 2].map((id) => [id, "GKP"] as const),
    ...[3, 4, 5, 6, 7].map((id) => [id, "DEF"] as const),
    ...[8, 9, 10, 11, 12].map((id) => [id, "MID"] as const),
    ...[13, 14, 15].map((id) => [id, "FWD"] as const),
  ]);
  const squad = Array.from({ length: 15 }, (_, i) => i + 1);
  const gw = (points: Record<number, number>): Gameweek => ({ event: 1, points, squads: {} });

  it("plays only one keeper, however well the other did", () => {
    expect(bestXIScore(squad, gw({ 1: 10, 2: 9 }), pos, rules)).toBe(10);
  });

  it("always fields three defenders, even if they scored nothing", () => {
    // Defenders and keepers score 0, but 1 GKP + 3 DEF must still play, leaving
    // 7 spots: all 5 MID (5 each) and the two best FWD (6, 6).
    const points = { 8: 5, 9: 5, 10: 5, 11: 5, 12: 5, 13: 6, 14: 6, 15: 1 };
    expect(bestXIScore(squad, gw(points), pos, rules)).toBe(5 * 5 + 6 + 6);
  });

  it("never plays more than three forwards", () => {
    const points = { 13: 10, 14: 10, 15: 10, 3: 1, 4: 1, 5: 1, 8: 1, 9: 1, 10: 1, 1: 1 };
    // 1 GKP (1) + 3 FWD (30) + 3 DEF (3) + 4 MID (three at 1, one at 0) = 37
    expect(bestXIScore(squad, gw(points), pos, rules)).toBe(37);
  });
});

describe("draft-only table (real data)", () => {
  const table = draftOnlyTable(league, draft, seasons, positions, rules);

  it("plays the same 5 gameweeks of fixtures for all 14 managers", () => {
    expect(table).toHaveLength(14);
    expect(table.every((r) => r.played === 5)).toBe(true);
    const wins = table.reduce((s, r) => s + r.won, 0);
    const losses = table.reduce((s, r) => s + r.lost, 0);
    expect(wins).toBe(losses);
  });

  it("includes every manager in the real league", () => {
    const real = computeStandings(league);
    expect(table.map((r) => r.leagueEntryId).sort()).toEqual(real.map((r) => r.leagueEntryId).sort());
  });
});

describe("squad origins (real data)", () => {
  const trades = cancelReversals(tradesJson.trades as Trade[]).trades;
  const origins = squadOrigins(entryIds, seasons, {
    transactions: transactionsJson.transactions as Transaction[],
    trades,
    draft,
  });
  const real = computeStandings(league);

  it("accounts for every point each manager has scored", () => {
    for (const o of origins) {
      const row = real.find((r) => r.entryId === o.entryId)!;
      const total = Object.values(o.points).reduce((s, x) => s + x, 0);
      expect(total, `entry ${o.entryId}`).toBe(row.pointsFor);
    }
  });

  it("splits each current squad of 15, with nothing of unknown origin", () => {
    for (const o of origins) {
      expect(Object.values(o.squad).reduce((s, x) => s + x, 0)).toBe(15);
      expect(o.squad.unknown).toBe(0);
    }
  });
});

describe("hindsight redraft (real data)", () => {
  const redraft = hindsightRedraft(draft, seasons, players, rules);
  const totals = seasonPoints(seasons);

  it("replays each manager's picks with hindsight against everyone else's real picks", () => {
    for (const id of entryIds) {
      const mine = redraft.filter((r) => r.entryId === id);
      // Fifteen different players, none of them taken by someone else first, in a legal squad.
      expect(new Set(mine.map((r) => r.bestAvailable)).size).toBe(15);
      for (const r of mine) {
        const takenBefore = redraft.filter((o) => o.entryId !== id && o.index < r.index).map((o) => o.actual);
        expect(takenBefore).not.toContain(r.bestAvailable);
      }
      const pos = mine.map((r) => positions.get(r.bestAvailable));
      expect(pos.filter((p) => p === "GKP")).toHaveLength(2);
      expect(mine.reduce((a, r) => a + r.bestAvailablePoints, 0)).toBeGreaterThanOrEqual(mine.reduce((a, r) => a + r.actualPoints, 0));
    }
    // The very first pick had the whole game to choose from.
    const top = Math.max(...players.map((p) => totals.get(p.id) ?? 0));
    expect(redraft[0].bestAvailablePoints).toBe(top);
  });

  it("never suggests a player FPL added after the pick was made", () => {
    const added = new Map(players.map((p) => [p.id, p.added]));
    const barcola = players.find((p) => p.name === "Barcola")!;
    expect(barcola.added! > redraft[0].time).toBe(true);
    for (const r of redraft) {
      for (const id of [r.hindsight, r.bestAvailable]) expect((added.get(id) ?? "") <= r.time).toBe(true);
    }
  });

  it("fills all 210 picks with different players", () => {
    expect(redraft).toHaveLength(210);
    expect(new Set(redraft.map((r) => r.hindsight)).size).toBe(210);
  });

  it("gives each manager a legal squad of 2 GKP, 5 DEF, 5 MID, 3 FWD", () => {
    for (const id of entryIds) {
      const mine = redraft.filter((r) => r.entryId === id).map((r) => positions.get(r.hindsight));
      expect(mine.filter((p) => p === "GKP")).toHaveLength(2);
      expect(mine.filter((p) => p === "DEF")).toHaveLength(5);
      expect(mine.filter((p) => p === "MID")).toHaveLength(5);
      expect(mine.filter((p) => p === "FWD")).toHaveLength(3);
    }
  });

  it("takes the season's top scorer first", () => {
    const best = Math.max(...players.map((p) => totals.get(p.id) ?? 0));
    expect(redraft[0].hindsightPoints).toBe(best);
  });
});
