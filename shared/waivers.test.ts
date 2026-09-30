import { describe, expect, it } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import choicesJson from "../fixtures/choices.json";
import elementStatus from "../fixtures/element-status.json";
import gameweeksJson from "../fixtures/gameweeks.json";
import transactionsJson from "../fixtures/transactions.json";
import { trimPlayers } from "../worker/index";
import type { Gameweek } from "./gameweek";
import { Seasons } from "./moves";
import type { DraftChoice, PlayersPayload, Transaction } from "./types";
import { clubDifficulty, draftDay, fixtureRun, freeAgentSignings, isOut, waiverSuggestions, weakestAt } from "./waivers";

const payload = JSON.parse(trimPlayers(JSON.stringify(bootstrap))) as PlayersPayload;
const players = payload.players;
const owners = new Map(
  (elementStatus as { element_status: { element: number; owner: number | null }[] }).element_status.map((s) => [s.element, s.owner]),
);
const seasons = new Seasons(gameweeksJson as unknown as Gameweek[]);
const transactions = (transactionsJson as { transactions: Transaction[] }).transactions;
const choices = (choicesJson as unknown as { choices: DraftChoice[] }).choices;

describe("clubDifficulty", () => {
  it("rates all 20 clubs 1 to 5, four clubs each", () => {
    const d = clubDifficulty(players);
    expect(d.size).toBe(20);
    for (let n = 1; n <= 5; n++) expect([...d.values()].filter((v) => v === n).length).toBe(4);
  });
});

describe("fixtureRun", () => {
  it("gives each club its next three fixtures in order", () => {
    const d = clubDifficulty(players);
    const run = fixtureRun(1, payload.fixtures, d);
    expect(run.length).toBe(3);
    expect(run.map((f) => f.event)).toEqual([...run.map((f) => f.event)].sort((a, b) => a - b));
    expect(run.every((f) => f.opponent !== 1)).toBe(true);
  });
});

describe("waiverSuggestions", () => {
  const list = waiverSuggestions(players, owners, payload.fixtures);
  it("only suggests fit, unowned players who've played", () => {
    expect(list.length).toBeGreaterThan(20);
    for (const s of list) {
      expect(owners.get(s.player.id) ?? null).toBeNull();
      expect(isOut(s.player)).toBe(false);
      expect(s.player.minutes).toBeGreaterThan(0);
    }
  });
  it("is sorted best first", () => {
    for (let i = 1; i < list.length; i++) expect(list[i - 1].rating).toBeGreaterThanOrEqual(list[i].rating);
  });
});

describe("weakestAt", () => {
  it("drops an injured player before a fit one", () => {
    const fit = { ...players[0], id: 1, status: "a", form: 1, chanceNext: null };
    const hurt = { ...players[0], id: 2, status: "i", form: 9, chanceNext: 0 };
    expect(weakestAt([fit, hurt], players[0].position)?.id).toBe(2);
  });
});

describe("freeAgentSignings", () => {
  it("lists every accepted free agent move, newest first", () => {
    const list = freeAgentSignings(transactions, seasons);
    expect(list.length).toBe(transactions.filter((t) => t.kind === "f" && t.result === "a").length);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].added >= list[i].added).toBe(true);
  });
});

describe("draftDay", () => {
  it("finds the auto picks and times every pick but the first", () => {
    const ids = [...new Set(choices.map((c) => c.entry))];
    const rows = draftDay(choices, ids);
    expect(rows.reduce((s, r) => s + r.autoPicks.length, 0)).toBe(choices.filter((c) => c.was_auto).length);
    expect(rows.every((r) => r.averageSeconds >= 0)).toBe(true);
  });
});
