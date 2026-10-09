import { describe, expect, it } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import { countdown, upcomingDeadlines } from "./deadlines";
import { trimPlayers } from "../worker/index";
import type { PlayersPayload } from "./types";

const { deadlines } = JSON.parse(trimPlayers(JSON.stringify(bootstrap))) as PlayersPayload;

describe("upcomingDeadlines", () => {
  it("comes from FPL's gameweek list", () => {
    expect(deadlines!.find((d) => d.event === 6)).toEqual({
      event: 6,
      trades: "2026-10-08T10:00:00Z",
      waivers: "2026-10-09T10:00:00Z",
      team: "2026-10-10T10:00:00Z",
    });
  });

  it("shows what's closed and what's next", () => {
    const up = upcomingDeadlines(deadlines!, Date.parse("2026-10-09T21:00:00Z"))!;
    expect(up.event).toBe(6);
    expect(up.items.map((i) => i.passed)).toEqual([true, true, false]);
    expect(up.next).toBe("team");
  });

  it("moves on to the next gameweek once the team deadline passes", () => {
    const up = upcomingDeadlines(deadlines!, Date.parse("2026-10-10T10:00:00Z"))!;
    expect(up.event).toBe(7);
    expect(up.next).toBe("trades");
  });

  it("is empty after the last deadline", () => {
    expect(upcomingDeadlines(deadlines!, Date.parse("2027-07-01T00:00:00Z"))).toBeNull();
  });
});

describe("countdown", () => {
  const now = Date.parse("2026-10-09T21:00:00Z");
  it("reads naturally", () => {
    expect(countdown("2026-10-09T21:25:00Z", now)).toBe("in 25 min");
    expect(countdown("2026-10-10T10:00:00Z", now)).toBe("in 13 h");
    expect(countdown("2026-10-15T10:00:00Z", now)).toBe("in 6 days");
  });
});
