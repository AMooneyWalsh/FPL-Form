import { describe, expect, it } from "vitest";
import gameweeksJson from "../fixtures/gameweeks.json";
import picks1412 from "../fixtures/entry-1412-event-5.json";
import picks174816 from "../fixtures/entry-174816-event-5.json";
import live5 from "../fixtures/event-5-live.json";
import leagueJson from "../fixtures/league-634-details.json";
import { buildGameweek, squadScore, type Gameweek, type RawLive, type RawPicks } from "./gameweek";

describe("buildGameweek", () => {
  const gw = buildGameweek(5, live5 as unknown as RawLive, {
    1412: picks1412 as unknown as RawPicks,
    174816: picks174816 as unknown as RawPicks,
  });

  it("keeps 11 players who counted and 4 on the bench", () => {
    expect(gw.squads[1412].played).toHaveLength(11);
    expect(gw.squads[1412].bench).toHaveLength(4);
  });

  it("applies FPL's auto-subs", () => {
    // Ross's GW5: 432 came on for 231 and 607 for 36.
    const { played, bench } = gw.squads[174816];
    expect(played).toEqual(expect.arrayContaining([432, 607]));
    expect(played).not.toContain(231);
    expect(bench).toEqual(expect.arrayContaining([231, 36]));
  });
});

describe("scores worked out from squads", () => {
  it("match every head-to-head score FPL recorded in GW1-5", () => {
    const gameweeks = gameweeksJson as unknown as Gameweek[];
    const toEntry = new Map(leagueJson.league_entries.map((e) => [e.id, e.entry_id]));
    let checked = 0;
    for (const m of leagueJson.matches.filter((m) => m.finished)) {
      const gw = gameweeks.find((g) => g.event === m.event)!;
      expect(squadScore(gw, toEntry.get(m.league_entry_1)!)).toBe(m.league_entry_1_points);
      expect(squadScore(gw, toEntry.get(m.league_entry_2)!)).toBe(m.league_entry_2_points);
      checked += 2;
    }
    expect(checked).toBe(70);
  });
});
