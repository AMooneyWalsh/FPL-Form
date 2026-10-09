import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import classic from "../fixtures/classic-2757.json";
import worker, { resetCachesForTests, trimClassic, trimPlayers, type Env } from "./index";

class FakeKv {
  store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

function makeEnv(kv?: FakeKv): Env {
  return {
    LEAGUE_ID: "634",
    DEFAULT_ENTRY_ID: "1412",
    LAST_GOOD: kv as unknown as KVNamespace,
    ASSETS: { fetch: async () => new Response("<html>site</html>") } as unknown as Fetcher,
  };
}

const waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext;

function get(path: string, env: Env) {
  return worker.fetch(new Request(`https://example.test${path}`), env, ctx);
}

const upstream = vi.fn<typeof fetch>();

beforeEach(() => {
  resetCachesForTests();
  upstream.mockReset();
  vi.stubGlobal("fetch", upstream);
  vi.useFakeTimers({ now: new Date("2026-09-30T12:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("worker", () => {
  it("serves the site for non-API paths", async () => {
    const res = await get("/", makeEnv());
    expect(await res.text()).toContain("site");
  });

  it("returns config from settings", async () => {
    const res = await get("/api/config", makeEnv());
    expect(await res.json()).toEqual({ leagueId: 634, defaultEntryId: 1412 });
  });

  it("fetches the right FPL address and wraps the data", async () => {
    upstream.mockResolvedValueOnce(new Response('{"trades":[]}'));
    const res = await get("/api/trades", makeEnv());
    expect(upstream.mock.calls[0][0]).toBe("https://draft.premierleague.com/api/draft/league/634/trades");
    expect(await res.json()).toEqual({ fetchedAt: "2026-09-30T12:00:00.000Z", stale: false, data: { trades: [] } });
  });

  it("reuses a fresh copy instead of asking FPL again", async () => {
    upstream.mockResolvedValue(new Response('{"a":1}'));
    const env = makeEnv();
    await get("/api/trades", env);
    await get("/api/trades", env);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("asks FPL again once the copy is too old", async () => {
    upstream.mockImplementation(async () => new Response('{"a":1}'));
    const env = makeEnv();
    await get("/api/trades", env);
    vi.setSystemTime(new Date("2026-09-30T12:03:00Z"));
    await get("/api/trades", env);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("serves the old copy marked stale when FPL fails", async () => {
    upstream.mockResolvedValueOnce(new Response('{"a":1}'));
    const env = makeEnv();
    await get("/api/trades", env);
    vi.setSystemTime(new Date("2026-09-30T12:03:00Z"));
    upstream.mockResolvedValueOnce(new Response("<html>maintenance</html>", { status: 200 }));
    const res = await get("/api/trades", env);
    const body = (await res.json()) as { stale: boolean; data: unknown };
    expect(body.stale).toBe(true);
    expect(body.data).toEqual({ a: 1 });
  });

  it("falls back to the saved KV copy in a fresh isolate", async () => {
    const kv = new FakeKv();
    upstream.mockResolvedValueOnce(new Response('{"a":1}'));
    await get("/api/trades", makeEnv(kv));
    await Promise.all(waits);
    expect(kv.store.has("634:trades")).toBe(true);

    resetCachesForTests();
    upstream.mockRejectedValueOnce(new Error("network down"));
    const res = await get("/api/trades", makeEnv(kv));
    expect(((await res.json()) as { stale: boolean }).stale).toBe(true);
  });

  it("says so clearly when FPL is down and nothing is saved", async () => {
    upstream.mockRejectedValueOnce(new Error("network down"));
    const res = await get("/api/trades", makeEnv());
    expect(res.status).toBe(502);
  });

  it("rejects unknown routes and writes", async () => {
    expect((await get("/api/nope", makeEnv())).status).toBe(404);
    const post = await worker.fetch(new Request("https://example.test/api/trades", { method: "POST" }), makeEnv(), ctx);
    expect(post.status).toBe(405);
  });
});

describe("gameweek route", () => {
  const league = {
    league: { id: 634 },
    league_entries: [
      { id: 1, entry_id: 11 },
      { id: 2, entry_id: 22 },
    ],
    matches: [],
  };
  const live = { elements: { "5": { stats: { total_points: 7, minutes: 90 } } } };
  const picks = (el: number) => ({ picks: [{ element: el, position: 1 }], subs: [] });

  function fakeFpl(currentEvent: number) {
    upstream.mockImplementation(async (input) => {
      const path = String(input).replace("https://draft.premierleague.com/api/", "");
      if (path === "game") return new Response(JSON.stringify({ current_event: currentEvent }));
      if (path === "league/634/details") return new Response(JSON.stringify(league));
      if (/^event\/\d+\/live$/.test(path)) return new Response(JSON.stringify(live));
      if (path.startsWith("entry/11/")) return new Response(JSON.stringify(picks(5)));
      if (path.startsWith("entry/22/")) return new Response(JSON.stringify(picks(6)));
      return new Response("nope", { status: 404 });
    });
  }

  it("builds points and squads for every manager", async () => {
    fakeFpl(3);
    const res = await get("/api/gw/2", makeEnv());
    const body = (await res.json()) as { data: { event: number; points: Record<string, number>; squads: Record<string, unknown> } };
    expect(body.data.event).toBe(2);
    expect(body.data.points).toEqual({ "5": 7 });
    expect(body.data.squads).toEqual({ "11": { played: [5], bench: [] }, "22": { played: [6], bench: [] } });
  });

  it("keeps a finished gameweek for good, even after the memory cache is gone", async () => {
    const kv = new FakeKv();
    fakeFpl(3);
    await get("/api/gw/2", makeEnv(kv));
    await Promise.all(waits);
    resetCachesForTests();
    upstream.mockReset();
    vi.setSystemTime(new Date("2026-12-30T12:00:00Z"));
    const res = await get("/api/gw/2", makeEnv(kv));
    expect(res.status).toBe(200);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refreshes the gameweek that's still going", async () => {
    fakeFpl(3);
    const env = makeEnv();
    await get("/api/gw/3", env);
    const calls = upstream.mock.calls.length;
    vi.setSystemTime(new Date("2026-09-30T12:03:00Z"));
    await get("/api/gw/3", env);
    expect(upstream.mock.calls.length).toBeGreaterThan(calls);
  });

  it("says no to gameweeks that haven't started", async () => {
    fakeFpl(3);
    expect((await get("/api/gw/4", makeEnv())).status).toBe(404);
  });
});

describe("trimPlayers", () => {
  it("shrinks the 1 MB player list to what the site needs", () => {
    const raw = JSON.stringify(bootstrap);
    const trimmed = trimPlayers(raw);
    // Form, injury news and fixtures make it bigger, but still well under a quarter.
    expect(trimmed.length).toBeLessThan(raw.length / 4);
    const { players, rules } = JSON.parse(trimmed) as {
      players: { id: number; name: string; team: string; teamCode: number; position: string }[];
      rules: unknown;
    };
    expect(players.length).toBe(bootstrap.elements.length);
    expect(players.find((p) => p.name === "Saka")).toMatchObject({ team: "ARS", teamCode: 3, position: "MID" });
    // Injury news and form come through for waiver suggestions.
    expect(players.find((p) => p.name === "White")).toMatchObject({ status: "d", chanceNext: 75 });
    expect(typeof (players[0] as unknown as { form: number }).form).toBe("number");
    expect((JSON.parse(trimmed) as { fixtures: unknown[] }).fixtures.length).toBeGreaterThan(0);
    expect(rules).toEqual({
      play: 11,
      select: { GKP: 2, DEF: 5, MID: 5, FWD: 3 },
      minPlay: { GKP: 1, DEF: 3, MID: 2, FWD: 1 },
      maxPlay: { GKP: 1, DEF: 5, MID: 5, FWD: 3 },
    });
  });
});

describe("live route", () => {
  const league = { league: { id: 634 }, league_entries: [{ id: 1, entry_id: 11 }, { id: 2, entry_id: 22 }], matches: [] };
  const live = {
    elements: {
      "5": {
        stats: { minutes: 90, total_points: 7, bonus: 0, bps: 30, starts: 1, goals_scored: 1 },
        explain: [[[{ stat: "minutes", value: 90, points: 2 }, { stat: "goals_scored", value: 1, points: 5 }], 9]],
      },
    },
    fixtures: [
      {
        id: 9, kickoff_time: "2026-10-10T11:30:00Z", started: true, finished: false, finished_provisional: false, minutes: 60,
        team_h: 1, team_a: 2, team_h_score: 1, team_a_score: 0,
        stats: [{ s: "bps", h: [{ element: 5, value: 30 }], a: [] }, { s: "bonus", h: [], a: [] }, { s: "goals_scored", h: [{ element: 5, value: 1 }], a: [] }],
      },
    ],
  };

  function fakeFpl(game: object, picksFor: (entry: string) => Response) {
    upstream.mockImplementation(async (input) => {
      const path = String(input).replace("https://draft.premierleague.com/api/", "");
      if (path === "game") return new Response(JSON.stringify(game));
      if (path === "league/634/details") return new Response(JSON.stringify(league));
      if (/^event\/\d+\/live$/.test(path)) return new Response(JSON.stringify(live));
      const m = /^entry\/(\d+)\//.exec(path);
      if (m) return picksFor(m[1]);
      return new Response("nope", { status: 404 });
    });
  }

  it("returns trimmed live data with every manager's lineup", async () => {
    fakeFpl({ current_event: 6, current_event_finished: false }, () =>
      new Response(JSON.stringify({ picks: [{ element: 5, position: 1, multiplier: 1 }], subs: [] })),
    );
    const body = (await (await get("/api/live/6", makeEnv())).json()) as { data: Record<string, any> };
    expect(body.data.elements).toEqual({
      "5": {
        minutes: 90, points: 7, bonus: 0, bps: 30, starts: 1,
        stats: { minutes: 90, goals_scored: 1 },
        breakdown: [["minutes", 90, 2], ["goals_scored", 1, 5]],
      },
    });
    expect(body.data.fixtures[0]).toMatchObject({
      id: 9, started: true, bonusConfirmed: false, bps: [{ element: 5, value: 30 }],
      events: { goals_scored: [{ element: 5, value: 1, home: true }] },
    });
    expect(Object.keys(body.data.picks)).toEqual(["11", "22"]);
    expect(body.data.picks["11"].picks).toEqual([{ element: 5, position: 1 }]);
  });

  it("still works before the deadline, when lineups are hidden", async () => {
    fakeFpl({ current_event: 5, current_event_finished: true }, () => new Response("Not found", { status: 404 }));
    const res = await get("/api/live/6", makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { picks: object } };
    expect(body.data.picks).toEqual({});
  });

  const paths = () => upstream.mock.calls.map(([input]) => String(input).replace("https://draft.premierleague.com/api/", ""));

  it("refreshes scores every 30 seconds while games are on, but not the locked lineups", async () => {
    fakeFpl({ current_event: 6, current_event_finished: false }, () =>
      new Response(JSON.stringify({ picks: [], subs: [] })),
    );
    const env = makeEnv();
    await get("/api/live/6", env);
    vi.setSystemTime(new Date("2026-09-30T12:00:20Z"));
    await get("/api/live/6", env);
    expect(paths().filter((p) => p === "event/6/live")).toHaveLength(1);
    upstream.mockClear();
    vi.setSystemTime(new Date("2026-09-30T12:00:40Z"));
    await get("/api/live/6", env);
    expect(paths()).toEqual(["event/6/live"]);
  });

  it("keeps asking for a lineup that failed to load", async () => {
    let failing = true;
    fakeFpl({ current_event: 6, current_event_finished: false }, (entry) =>
      entry === "22" && failing
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ picks: [{ element: 5, position: 1 }], subs: [] })),
    );
    const env = makeEnv();
    await get("/api/live/6", env);
    failing = false;
    vi.setSystemTime(new Date("2026-09-30T12:00:40Z"));
    const body = (await (await get("/api/live/6", env)).json()) as { data: { picks: object } };
    expect(Object.keys(body.data.picks)).toEqual(["11", "22"]);
  });

  it("tells the browser to keep a copy only as long as the server would", async () => {
    fakeFpl({ current_event: 6, current_event_finished: false }, () =>
      new Response(JSON.stringify({ picks: [], subs: [] })),
    );
    const env = makeEnv();
    expect((await get("/api/live/6", env)).headers.get("Cache-Control")).toBe("public, max-age=30");
    vi.setSystemTime(new Date("2026-09-30T12:00:20Z"));
    expect((await get("/api/live/6", env)).headers.get("Cache-Control")).toBe("public, max-age=10");
  });

  it("refuses gameweeks too far ahead", async () => {
    fakeFpl({ current_event: 5, current_event_finished: true }, () => new Response("{}"));
    expect((await get("/api/live/9", makeEnv())).status).toBe(404);
  });
});

describe("trimClassic", () => {
  it("keeps name, rank and total for every manager", () => {
    const out = JSON.parse(trimClassic(JSON.stringify(classic)));
    expect(out.standings).toHaveLength(14);
    expect(Object.keys(out.standings[0]).sort()).toEqual(["name", "rank", "total"]);
    expect(out.standings[0].rank).toBe(1);
  });
});
