import { describe, expect, it } from "vitest";
import choicesJson from "../fixtures/choices.json";
import gameweeksJson from "../fixtures/gameweeks.json";
import leagueJson from "../fixtures/league-634-details.json";
import tradesJson from "../fixtures/trades.json";
import transactionsJson from "../fixtures/transactions.json";
import type { Gameweek } from "./gameweek";
import { playerJourney, Seasons, tradeLedger, tradeVerdicts, waiverBattles, waiverRecord } from "./moves";
import type { DraftChoice, Trade, Transaction } from "./types";

const gameweeks = gameweeksJson as unknown as Gameweek[];
const trades = tradesJson.trades as Trade[];
const transactions = transactionsJson.transactions as Transaction[];
const draft = choicesJson.choices as DraftChoice[];
const entryIds = leagueJson.league_entries.map((e) => e.entry_id);
const seasons = new Seasons(gameweeks);

describe("with league 634's real data (GW1-5)", () => {
  const verdicts = tradeVerdicts(trades, seasons);

  it("judges every processed trade, newest first", () => {
    expect(verdicts).toHaveLength(trades.length);
    const times = verdicts.map((v) => v.time);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("totals each side from its players and picks the right winner", () => {
    for (const v of verdicts) {
      for (const side of [v.offerer, v.receiver]) {
        expect(side.total).toBe(side.received.reduce((s, p) => s + p.points, 0));
      }
      expect(v.margin).toBe(Math.abs(v.offerer.total - v.receiver.total));
      if (v.winner !== null) {
        const winning = v.winner === v.offerer.entryId ? v.offerer : v.receiver;
        const losing = winning === v.offerer ? v.receiver : v.offerer;
        expect(winning.total).toBeGreaterThan(losing.total);
      }
    }
  });

  it("gives every manager a ledger row and counts each trade twice", () => {
    const ledger = tradeLedger(verdicts, entryIds);
    expect(ledger).toHaveLength(14);
    expect(ledger.reduce((s, r) => s + r.trades, 0)).toBe(verdicts.length * 2);
    for (const r of ledger) expect(r.net).toBe(r.gained - r.given);
  });

  it("finds waiver battles with one line per manager and at most one winner", () => {
    const battles = waiverBattles(transactions, seasons);
    expect(battles.length).toBeGreaterThan(0);
    for (const b of battles) {
      const managers = b.claims.map((c) => c.entryId);
      expect(new Set(managers).size).toBe(managers.length);
      expect(managers.length).toBeGreaterThanOrEqual(2);
      expect(b.claims.filter((c) => c.result === "a").length).toBeLessThanOrEqual(1);
    }
  });

  it("counts every waiver claim in the season record", () => {
    const record = waiverRecord(transactions, seasons, entryIds);
    expect(record.reduce((s, r) => s + r.claims, 0)).toBe(transactions.filter((t) => t.kind === "w").length);
  });

  it("knows how every currently owned player was acquired", () => {
    const latest = gameweeks.at(-1)!;
    const owned = Object.values(latest.squads).flatMap((s) => [...s.played, ...s.bench]);
    for (const el of owned) {
      const stints = playerJourney(el, seasons, { transactions, trades, draft });
      expect(stints.every((s) => s.how !== "unknown"), `player ${el}`).toBe(true);
    }
  });

  it("follows a drafted player through a trade (Sarr: drafted by Daire, traded to Michael)", () => {
    const SARR = 208;
    const pick = draft.find((d) => d.element === SARR)!;
    expect(pick.entry).toBe(1679);
    const stints = playerJourney(SARR, seasons, { transactions, trades, draft });
    expect(stints[0]).toMatchObject({ entryId: 1679, from: 1, to: 1, how: "draft", draftPick: pick.index });
    expect(stints[1]).toMatchObject({ entryId: 1447, from: 2, how: "trade" });
  });
});

// Small hand-made seasons where the right answers are easy to check.
function gw(event: number, points: Record<number, number>, squads: Record<number, [number[], number[]]>): Gameweek {
  return {
    event,
    points,
    squads: Object.fromEntries(Object.entries(squads).map(([id, [played, bench]]) => [id, { played, bench }])),
  };
}

function trade(id: number, event: number, offered: number, received: number, items: [number, number][], time: string): Trade {
  return {
    id,
    event,
    offered_entry: offered,
    received_entry: received,
    offer_time: time,
    response_time: time,
    state: "p",
    tradeitem_set: items.map(([element_in, element_out]) => ({ element_in, element_out })),
  };
}

describe("points rules", () => {
  // Manager 1 owns player 10 in GW1-2, benches him in GW2, then loses him.
  const s = new Seasons([
    gw(1, { 10: 5 }, { 1: [[10], []] }),
    gw(2, { 10: 7 }, { 1: [[], [10]] }),
    gw(3, { 10: 9 }, { 2: [[10], []] }),
  ]);

  it("only counts points from the XI, and stops when the player leaves", () => {
    expect(s.spell(10, 1, 1)).toEqual({ points: 5, benchPoints: 7, gameweeks: 2, stillOwned: false });
    expect(s.spell(10, 2, 3)).toEqual({ points: 9, benchPoints: 0, gameweeks: 1, stillOwned: true });
  });

  it("marks a trade pending until a gameweek has been played", () => {
    const [v] = tradeVerdicts([trade(1, 4, 1, 2, [[20, 10]], "2026-10-01T00:00:00Z")], s);
    expect(v.pending).toBe(true);
  });
});

describe("passing a player straight on in another trade", () => {
  // GW2: A (1) gives X (100) to B (2) for S (200). A then passes S to C (3) for Y (300).
  // S scores 10 for C, Y scores 4 for A, X scores 6 for B.
  const s = new Seasons([
    gw(1, {}, { 1: [[100], []], 2: [[200], []], 3: [[300], []] }),
    gw(2, { 100: 6, 200: 10, 300: 4 }, { 1: [[300], []], 2: [[100], []], 3: [[200], []] }),
  ]);
  const verdicts = tradeVerdicts(
    [
      trade(1, 2, 1, 2, [[200, 100]], "2026-08-20T10:00:00Z"),
      trade(2, 2, 1, 3, [[300, 200]], "2026-08-20T11:00:00Z"),
    ],
    s,
  );
  const ledger = tradeLedger(verdicts, [1, 2, 3]);
  const a = ledger.find((r) => r.entryId === 1)!;

  it("scores A as having turned X into Y, not charging S twice", () => {
    expect(a.gained).toBe(4); // Y for A (S never played for A)
    expect(a.given).toBe(6); // X for B; S was traded in, so not charged
    expect(a.net).toBe(-2);
  });

  it("still counts S against C's trade partner normally", () => {
    const c = ledger.find((r) => r.entryId === 3)!;
    expect(c.gained).toBe(10);
    expect(c.given).toBe(4);
  });
});

describe("waiver battles", () => {
  const s = new Seasons([gw(3, { 50: 8 }, { 1: [[50], []] })]);
  const claim = (entry: number, result: Transaction["result"], priority: number, out: number): Transaction => ({
    id: entry * 100 + priority,
    entry,
    event: 3,
    kind: "w",
    result,
    element_in: 50,
    element_out: out,
    priority,
    added: "2026-09-01T00:00:00Z",
  });

  it("shows each manager once, winner first, with what he's scored since", () => {
    const [b] = waiverBattles([claim(2, "di", 1, 7), claim(1, "a", 1, 5), claim(2, "do", 2, 8), claim(3, "di", 3, 9)], s);
    expect(b.claims.map((c) => [c.entryId, c.result])).toEqual([
      [1, "a"],
      [2, "di"],
      [3, "di"],
    ]);
    expect(b.winnerPoints).toBe(8);
  });

  it("ignores a player only one manager wanted", () => {
    expect(waiverBattles([claim(1, "a", 1, 5), claim(1, "di", 2, 6)], s)).toEqual([]);
  });
});
