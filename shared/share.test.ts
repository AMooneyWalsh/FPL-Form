import { describe, expect, it } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import live5 from "../fixtures/event-5-live.json";
import gameweeksJson from "../fixtures/gameweeks.json";
import gw5Picks from "../fixtures/gw5-picks.json";
import leagueJson from "../fixtures/league-634-details.json";
import tradesJson from "../fixtures/trades.json";
import transactionsJson from "../fixtures/transactions.json";
import { trimPlayers } from "../worker/index";
import type { Gameweek } from "./gameweek";
import { liveMatches, toLiveGameweek, type LivePicks, type PlayerInfo, type RawLiveResponse } from "./live";
import { Seasons, tradeVerdicts } from "./moves";
import { matchCard, slug, topScorers, tradeCard, trimToWidth, wrapToWidth, type ShareNames, type VersusBlock } from "./share";
import { managerLabels } from "./standings";
import type { LeagueDetails, PlayersPayload, Trade, Transaction } from "./types";

const league = leagueJson as unknown as LeagueDetails;
const { players, rules } = JSON.parse(trimPlayers(JSON.stringify(bootstrap))) as PlayersPayload;
const info = new Map<number, PlayerInfo>(players.map((p) => [p.id, { position: p.position, teamId: p.teamId }]));
const gw = toLiveGameweek(5, live5 as unknown as RawLiveResponse, gw5Picks as unknown as Record<number, LivePicks>);
const matches = liveMatches(league, gw, info, rules);
const names: ShareNames = {
  league: league.league.name,
  managers: managerLabels(league.league_entries),
  teams: new Map(league.league_entries.map((e) => [e.entry_id, e.entry_name])),
  players: new Map(players.map((p) => [p.id, p.name])),
};
const versus = (blocks: unknown[]) => blocks.find((b) => (b as VersusBlock).kind === "versus") as VersusBlock;

describe("match result card (GW5)", () => {
  it("shows both scores, with the winner on the green panel and solid Won / Lost once final", () => {
    for (const m of matches) {
      const card = matchCard(m, 5, "final", names);
      const [home, away] = versus(card.blocks).sides;
      expect(card.title).toBe("Gameweek 5");
      expect(card.tag?.text).toBe("Final");
      expect(home.name).toBe(names.managers.get(m.homeEntry));
      expect(away.detail).toBe(names.teams.get(m.awayEntry));
      expect([home.big, away.big]).toEqual([String(m.home!.score), String(m.away!.score)]);
      expect(home.highlight).toBe(m.home!.score > m.away!.score);
      expect(away.highlight).toBe(m.away!.score > m.home!.score);
      const want = m.home!.score > m.away!.score ? "Won" : m.home!.score < m.away!.score ? "Lost" : "Draw";
      expect(home.badge).toMatchObject({ text: want, outline: false });
    }
  });

  it("lists each side's top three scorers from the XI that counted, best first", () => {
    for (const m of matches) {
      const side = versus(matchCard(m, 5, "final", names).blocks).sides[0];
      const counting = m.home!.players.filter((p) => p.counts).map((p) => p.points);
      const best = [...counting].sort((a, b) => b - a).slice(0, 3).filter((p) => p > 0);
      expect(side.rows.map((r) => Number(r.value))).toEqual(best);
      expect(side.rows.every((r) => !r.label.startsWith("Someone"))).toBe(true);
    }
  });

  it("says who's ahead and who has players to come while it's live, outlined", () => {
    const m = matches.find((x) => x.home!.score !== x.away!.score)!;
    const card = matchCard(m, 5, "live", names);
    const [home, away] = versus(card.blocks).sides;
    const leader = m.home!.score > m.away!.score ? home : away;
    const other = leader === home ? away : home;
    expect(card.tag).toEqual({ text: "Live", tone: "live" });
    expect(leader.badge).toEqual({ text: "Ahead", tone: "good", outline: true });
    expect(other.badge).toBeUndefined();
    // GW5 is over, so everyone has played.
    expect(home.note).toBe("All played");
    expect(card.caption).toMatch(/^Gameweek 5, live: /);
  });

  it("keeps the badges outlined until FPL confirms the gameweek", () => {
    const card = matchCard(matches[0], 5, "done", names);
    expect(card.tag?.text).toBe("Full time");
    expect(versus(card.blocks).sides.every((s) => s.badge?.outline)).toBe(true);
  });

  it("names the winner in the caption and makes a tidy file name", () => {
    const m = matches.find((x) => x.home!.score > x.away!.score)!;
    const card = matchCard(m, 5, "final", names);
    const [home, away] = [names.managers.get(m.homeEntry), names.managers.get(m.awayEntry)];
    expect(card.caption).toBe(`${home} beat ${away} ${m.home!.score}-${m.away!.score} in gameweek 5.`);
    expect(card.file).toMatch(/^gw5-[a-z0-9-]+-v-[a-z0-9-]+$/);
  });

  it("has no scorers before anyone plays", () => {
    expect(topScorers(null, 3)).toEqual([]);
  });
});

describe("trade verdict card (league 634)", () => {
  const verdicts = tradeVerdicts(
    tradesJson.trades as Trade[],
    new Seasons(gameweeksJson as unknown as Gameweek[]),
    transactionsJson.transactions as Transaction[],
  );

  it("puts the verdict in the title and each side's points on its panel", () => {
    const v = verdicts.find((x) => !x.pending && x.winner !== null)!;
    const card = tradeCard(v, names);
    const [offerer, receiver] = versus(card.blocks).sides;
    expect(card.title).toBe(`${names.managers.get(v.winner!)} +${v.margin}`);
    expect(card.subtitle).toContain(`gameweek ${v.event}`);
    expect(offerer.big).toBe(String(Math.round(v.offerer.total)));
    expect(offerer.rows).toHaveLength(v.offerer.received.length);
    expect(receiver.rows.map((r) => r.value)).toEqual(v.receiver.received.map((p) => String(Math.round(p.value))));
    expect((v.winner === v.offerer.entryId ? offerer : receiver).highlight).toBe(true);
    expect(card.caption).toContain(`${names.managers.get(v.winner!)} +${v.margin} so far.`);
  });

  it("calls a trade nobody has played since too early, with no numbers", () => {
    const card = tradeCard({ ...verdicts[0], pending: true }, names);
    const sides = versus(card.blocks).sides;
    expect(card.title).toBe("Too early to call");
    expect(sides.every((s) => s.big === undefined && !s.highlight && s.rows.every((r) => r.value === undefined))).toBe(true);
    expect(card.caption).toMatch(/trade: too early to call\.$/);
  });

  it("says level when nobody's ahead", () => {
    const card = tradeCard({ ...verdicts[0], pending: false, winner: null, margin: 0 }, names);
    expect(card.title).toBe("Level so far");
    expect(versus(card.blocks).sides.some((s) => s.highlight)).toBe(false);
  });
});

describe("text that fits", () => {
  const chars = (s: string) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].length;

  it("leaves text that fits alone and cuts the rest short with an ellipsis", () => {
    expect(trimToWidth("Adam", 10, chars)).toBe("Adam");
    expect(trimToWidth("Oogaboogawooga", 8, chars)).toBe("Oogaboo…");
    // No space before the "…".
    expect(trimToWidth("Big Ange FC", 5, chars)).toBe("Big…");
  });

  it("never splits an emoji or an accented letter", () => {
    expect(trimToWidth("ab👍🏽cdef", 4, chars)).toBe("ab👍🏽…");
    expect(trimToWidth("Ødegaard's XI", 4, chars)).toBe("Øde…");
  });

  it("wraps onto lines and cuts the last one short when there are too many", () => {
    expect(wrapToWidth("one two three", 9, chars)).toEqual(["one two", "three"]);
    expect(wrapToWidth("one two three four five", 9, chars, 2)).toEqual(["one two", "three fo…"]);
  });

  it("makes file names from anything", () => {
    expect(slug("gw7 Ruairi M v Gyök Hate Watch!")).toBe("gw7-ruairi-m-v-gyok-hate-watch");
    expect(slug("🎉")).toBe("drafty-in-here");
  });
});
