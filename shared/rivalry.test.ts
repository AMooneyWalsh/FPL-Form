import { describe, expect, it } from "vitest";
import choicesJson from "../fixtures/choices.json";
import gameweeksJson from "../fixtures/gameweeks.json";
import leagueJson from "../fixtures/league-634-details.json";
import tradesJson from "../fixtures/trades.json";
import transactionsJson from "../fixtures/transactions.json";
import type { Gameweek } from "./gameweek";
import { cancelReversals, Seasons } from "./moves";
import { rivalry, rivalryContext } from "./rivalry";
import { headToHead } from "./results";
import type { DraftChoice, LeagueDetails, Trade, Transaction } from "./types";

const league = leagueJson as unknown as LeagueDetails;
const seasons = new Seasons(gameweeksJson as unknown as Gameweek[]);
const ctx = rivalryContext({
  details: league,
  seasons,
  // As the site does: same-gameweek swap-backs cancelled first.
  trades: cancelReversals(tradesJson.trades as Trade[]).trades,
  transactions: transactionsJson.transactions as Transaction[],
  draft: choicesJson.choices as DraftChoice[],
});
const DAIRE = 1679;
const ROSS = 174816;
const ADAM = 1412;
const MICHAEL = 1447;
const GROSS = 124;
const MITCHELL = 204;

describe("Daire v Ross (real data, GW1-5)", () => {
  const r = rivalry(ctx, DAIRE, ROSS);

  it("finds their trades, with Ross ahead by the 26 Aug verdict", () => {
    // docs/trade-scoring.md: Hill and Doku for Mitchell and Groß, Ross +54. Their GW6 trade is too early to call.
    expect(r.trades).toHaveLength(2);
    expect(r.tradeTally).toEqual({ aWon: 0, bWon: 1, level: 0, pending: 1, net: -54 });
    for (const v of r.trades) expect([v.offerer.entryId, v.receiver.entryId].sort()).toEqual([DAIRE, ROSS].sort());
  });

  it("lists players who've been in both squads, with what each scored for both", () => {
    const gross = r.shared.find((p) => p.element === GROSS)!;
    const mitchell = r.shared.find((p) => p.element === MITCHELL)!;
    // Drafted by Daire, then traded to Ross: the trade doc's 45 and 23 for Ross.
    expect(gross).toMatchObject({ bPoints: 45, first: DAIRE });
    expect(mitchell).toMatchObject({ bPoints: 23, first: DAIRE });
    // Cross-check every shared player against the squads that actually played.
    for (const p of r.shared) {
      const xi = (id: number) =>
        seasons.gameweeks.reduce((s, g) => s + (g.squads[id]?.played.includes(p.element) ? (g.points[p.element] ?? 0) : 0), 0);
      expect(p.aPoints).toBe(xi(DAIRE));
      expect(p.bPoints).toBe(xi(ROSS));
    }
    const totals = r.shared.map((p) => p.aPoints + p.bPoints);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it("keeps their real meeting and counts every week as if they'd played", () => {
    expect(r.meetings).toEqual(headToHead(league, DAIRE, ROSS));
    expect(r.meetings.matches).toHaveLength(1);
    expect(r.everyWeek.aAhead + r.everyWeek.bAhead + r.everyWeek.level).toBe(5);
  });

  it("only counts waiver battles both were in", () => {
    for (const b of r.battles) {
      const who = b.claims.map((c) => c.entryId);
      expect(who).toContain(DAIRE);
      expect(who).toContain(ROSS);
    }
    const t = r.battleTally;
    expect(t.aWon + t.bWon + t.other).toBe(r.battles.length);
  });

  it("marks the better side of each line of the tape", () => {
    const line = (key: string) => r.tape.find((t) => t.key === key)!;
    expect(line("tradeNet").leader).toBe(ROSS);
    // Level on league points; Daire is a place higher on points scored (215 to 214).
    expect(line("leaguePoints").leader).toBeNull();
    expect(line("position")).toMatchObject({ a: 5, b: 6, leader: DAIRE });
    for (const t of r.tape) {
      if (t.a === t.b) expect(t.leader).toBeNull();
      else expect(t.leader).toBe((t.better === "high" ? t.a > t.b : t.a < t.b) ? DAIRE : ROSS);
    }
  });
});

describe("any pair", () => {
  it("reads the same from either side", () => {
    const ab = rivalry(ctx, DAIRE, ROSS);
    const ba = rivalry(ctx, ROSS, DAIRE);
    expect(ba.tradeTally).toMatchObject({ aWon: ab.tradeTally.bWon, bWon: ab.tradeTally.aWon, net: -ab.tradeTally.net });
    expect(ba.everyWeek).toEqual({ aAhead: ab.everyWeek.bAhead, bAhead: ab.everyWeek.aAhead, level: ab.everyWeek.level });
    expect(ba.battleTally).toEqual({ aWon: ab.battleTally.bWon, bWon: ab.battleTally.aWon, other: ab.battleTally.other });
    ba.tape.forEach((t, i) => {
      expect([t.a, t.b]).toEqual([ab.tape[i].b, ab.tape[i].a]);
      expect(t.leader).toBe(ab.tape[i].leader);
    });
    expect(ba.shared.map((p) => p.element)).toEqual(ab.shared.map((p) => p.element));
  });

  it("is empty where they've had nothing to do with each other", () => {
    const r = rivalry(ctx, ADAM, MICHAEL);
    expect(r.trades).toEqual([]);
    expect(r.tradeTally).toEqual({ aWon: 0, bWon: 0, level: 0, pending: 0, net: 0 });
    expect(r.shared).toEqual([]);
  });
});
