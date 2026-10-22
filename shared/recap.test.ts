import { describe, expect, it } from "vitest";
import gameweeksJson from "../fixtures/gameweeks.json";
import leagueJson from "../fixtures/league-634-details.json";
import tradesJson from "../fixtures/trades.json";
import transactionsJson from "../fixtures/transactions.json";
import type { Gameweek } from "./gameweek";
import { cancelReversals, Seasons, tradeTimeline } from "./moves";
import { finishedGameweeks, gameweekRecap, listOf, recapWords, type RecapFacts, type RecapNames } from "./recap";
import { recapCard } from "./share";
import { managerLabels } from "./standings";
import type { LeagueDetails, Match, Transaction } from "./types";

const league = leagueJson as unknown as LeagueDetails;
const seasons = new Seasons(gameweeksJson as unknown as Gameweek[]);
const { trades } = cancelReversals(tradesJson.trades);
const transactions = transactionsJson.transactions as Transaction[];
const src = { league, seasons, trades, transactions };
const labels = managerLabels(league.league_entries);
const names: RecapNames = { manager: (id) => labels.get(id) ?? "?", player: (el) => `P${el}` };
const id = (name: string) => [...labels].find(([, label]) => label === name)![0];

describe("finished gameweeks", () => {
  it("only lists gameweeks where every match has finished", () => {
    expect(finishedGameweeks(league)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("GW5 recap (real data)", () => {
  const f = gameweekRecap(src, 5);

  it("has every match and every manager's score", () => {
    expect(f.matches).toHaveLength(7);
    expect(f.scores).toHaveLength(14);
    expect(f.scores.map((s) => s.score)).toEqual([...f.scores.map((s) => s.score)].sort((a, b) => b - a));
  });

  it("picks the top and bottom scores", () => {
    expect(f.top).toEqual({ entryIds: [id("Adam")], score: 60, next: 54 });
    expect(f.bottom).toEqual({ entryIds: [id("Ben")], score: 23 });
  });

  it("finds the biggest win, the closest match, and the luck either way", () => {
    expect(f.biggestWin.map((m) => [m.winner, m.loser, m.margin])).toEqual([[id("Jack"), id("Daire"), 15]]);
    expect(f.closest.map((m) => [m.winner, m.loser, m.margin])).toEqual([[id("Peter"), id("Darragh"), 2]]);
    // Ross and Mark both won with 36, below the middle score of 40: a tie names both.
    expect(f.median).toBe(40);
    expect(f.jammiest?.score).toBe(36);
    expect(f.jammiest?.matches.map((m) => m.winner)).toEqual([id("Ross"), id("Mark")]);
    expect(f.robbed).toMatchObject({ score: 54, wouldHaveBeaten: 12 });
    expect(f.robbed?.matches[0].loser).toBe(id("Conor"));
  });

  it("works out bench points from the squads", () => {
    expect(f.bench).toMatchObject({ entryIds: [id("Darragh")], points: 16 });
    const gw = seasons.gameweeks.find((g) => g.event === 5)!;
    const squad = gw.squads[id("Darragh")];
    expect(squad.bench.reduce((s, el) => s + (gw.points[el] ?? 0), 0)).toBe(16);
  });

  it("names both players when two share player of the week", () => {
    expect(f.player?.points).toBe(17);
    expect(f.player?.picks.map((p) => p.entryId)).toEqual([id("Conor"), id("Ruairi M")]);
  });

  it("follows the table: who moved and who's on a run", () => {
    expect(f.table).toMatchObject({ leaders: [id("Adam")], before: [id("Adam")], weeksTop: 5 });
    expect(f.climb).toEqual({ places: 3, movers: [{ entryId: id("Peter"), from: 10, to: 7 }] });
    expect(f.fall).toEqual({ places: 3, movers: [{ entryId: id("Daire"), from: 2, to: 5 }] });
    expect(f.streaks).toEqual([
      { entryId: id("Joe"), result: "L", run: 5 },
      { entryId: id("Conor"), result: "L", run: 3 },
    ]);
  });
});

describe("signings and trades of the week (real data)", () => {
  it("counts a player signed, dropped and signed again in one week once", () => {
    const f = gameweekRecap(src, 4);
    expect(f.signing?.picks).toHaveLength(1);
    expect(f.signing).toMatchObject({ points: 14, picks: [{ entryId: id("Daire"), kind: "free agent" }] });
  });

  it("judges the trade of the week exactly as its card's first week", () => {
    const f = gameweekRecap(src, 2);
    const first = tradeTimeline(trades, seasons, transactions).get(f.trade!.verdict.id)![0];
    expect(f.trade?.count).toBe(6);
    expect([f.trade?.verdict.winner, f.trade?.verdict.margin]).toEqual([first.winner, first.margin]);
    expect([first.event, first.winner, first.margin]).toEqual([2, id("Ross"), 12]);
  });

  it("has no table moves in the first gameweek", () => {
    const f = gameweekRecap(src, 1);
    expect(f.table.before).toBeNull();
    expect(f.climb).toBeNull();
    expect(f.fall).toBeNull();
  });
});

describe("writing it up", () => {
  const every = finishedGameweeks(league).map((n) => recapWords(gameweekRecap(src, n), names));
  const allText = every.flatMap((w) => [...w.headlines, ...w.awards.map((a) => a.line)]);

  it("has two to four headlines every week", () => {
    for (const w of every) {
      expect(w.headlines.length).toBeGreaterThanOrEqual(2);
      expect(w.headlines.length).toBeLessThanOrEqual(4);
    }
  });

  it("follows the house style: no em dashes, names not pronouns, full stops", () => {
    for (const s of allText) {
      expect(s).not.toMatch(/—/);
      expect(s).not.toMatch(/\b(he|his|him|she|her|they|their)\b/i);
      expect(s).toMatch(/\.$/);
      expect(s).not.toMatch(/\.\./);
    }
  });

  it("gives the same words every time for the same week", () => {
    expect(recapWords(gameweekRecap(src, 5), names)).toEqual(every[4]);
  });

  it("varies the wording from one week to the next", () => {
    const f = gameweekRecap(src, 5);
    const next: RecapFacts = { ...f, event: 6 };
    expect(recapWords(next, names).headlines[0]).not.toBe(every[4].headlines[0]);
  });

  it("starts with Adam's 60 and the award order", () => {
    const w = every[4];
    expect(w.headlines[0]).toMatch(/Adam/);
    expect(w.headlines[0]).toMatch(/60/);
    expect(w.awards.map((a) => a.id)).toEqual([
      "top",
      "spoon",
      "biggest",
      "closest",
      "jammiest",
      "robbed",
      "bench",
      "player",
      "signing",
      "trade",
      "climber",
      "faller",
      "streak",
    ]);
  });
});

describe("ties and missing squads", () => {
  // Four managers, one gameweek: A 60 v B 30, C 60 v D 60. No squads loaded.
  const entry = (id: number, entry_id: number, first: string) => ({
    id,
    entry_id,
    entry_name: `${first} FC`,
    player_first_name: first,
    player_last_name: "X",
    short_name: first.slice(0, 2),
    waiver_pick: id,
    joined_time: "",
  });
  const match = (a: number, pa: number, b: number, pb: number): Match => ({
    event: 1,
    started: true,
    finished: true,
    league_entry_1: a,
    league_entry_1_points: pa,
    league_entry_2: b,
    league_entry_2_points: pb,
  });
  const tiny: LeagueDetails = {
    league: { ...league.league, start_event: 1 },
    league_entries: [entry(1, 11, "Ann"), entry(2, 22, "Bob"), entry(3, 33, "Cat"), entry(4, 44, "Dan")],
    matches: [match(1, 60, 2, 30), match(3, 60, 4, 60)],
  };
  const f = gameweekRecap({ league: tiny, seasons: new Seasons([]), trades: [], transactions: [] }, 1);
  const tinyLabels = managerLabels(tiny.league_entries);
  const w = recapWords(f, { manager: (id) => tinyLabels.get(id)!, player: String });

  it("names everyone on the top score", () => {
    expect(f.top.entryIds).toEqual([11, 33, 44]);
    expect(w.headlines[0]).toBe("Ann, Cat and Dan shared the week's best score, 60.");
    expect(w.awards[0].line).toBe("Ann, Cat and Dan all scored 60. Nobody else got near.");
    expect(w.awards[1]).toMatchObject({ id: "spoon", entryIds: [22], stat: "30 pts" });
  });

  it("calls a draw the closest match", () => {
    expect(w.awards.find((a) => a.id === "closest")).toMatchObject({ stat: "Draw", line: "Cat and Dan drew 60 each.", versus: true });
  });

  it("skips awards that need the gameweek's squads or trades", () => {
    const ids = w.awards.map((a) => a.id);
    for (const missing of ["bench", "player", "signing", "trade", "climber", "faller", "streak"]) expect(ids).not.toContain(missing);
  });

  it("lists names the way people say them", () => {
    expect(listOf(["Ben"])).toBe("Ben");
    expect(listOf(["Ben", "Daire"])).toBe("Ben and Daire");
    expect(listOf(["Ben", "Daire", "Ross"])).toBe("Ben, Daire and Ross");
  });
});

describe("GW5 recap picture", () => {
  const f = gameweekRecap(src, 5);
  const words = recapWords(f, names);
  const card = recapCard(5, f.matches, words, {
    league: "Drafty In Here",
    managers: labels,
    teams: new Map(),
    players: new Map(),
  });

  it("leads with the first headline, then every result and up to six awards", () => {
    const [headline, results, awards] = card.blocks;
    expect(headline).toMatchObject({ kind: "headline", text: "Adam · 60 pts", detail: words.headlines.slice(0, 2).join(" ") });
    expect(results.kind === "lines" && results.rows).toHaveLength(7);
    expect(awards.kind === "lines" && awards.rows.length).toBe(Math.min(6, words.awards.length));
  });

  it("names the winner first in each result", () => {
    const results = card.blocks[1];
    if (results.kind !== "lines") throw new Error("expected lines");
    f.matches.forEach((m, i) => {
      const row = results.rows[i];
      if (m.winner === null) return expect(row.label).toContain("drew with");
      expect(row.label.startsWith(`${labels.get(m.winner)} beat`)).toBe(true);
      expect(row.value).toBe(`${Math.max(m.homeScore, m.awayScore)}-${Math.min(m.homeScore, m.awayScore)}`);
    });
  });
});
