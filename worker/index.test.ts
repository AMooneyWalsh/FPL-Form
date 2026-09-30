import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import worker, { resetCachesForTests, trimPlayers, type Env } from "./index";

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
    expect(trimmed.length).toBeLessThan(raw.length / 5);
    const { players, rules } = JSON.parse(trimmed) as {
      players: { id: number; name: string; team: string; position: string }[];
      rules: unknown;
    };
    expect(players.length).toBe(bootstrap.elements.length);
    expect(players.find((p) => p.name === "Saka")).toMatchObject({ team: "ARS", position: "MID" });
    expect(rules).toEqual({
      play: 11,
      select: { GKP: 2, DEF: 5, MID: 5, FWD: 3 },
      minPlay: { GKP: 1, DEF: 3, MID: 2, FWD: 1 },
      maxPlay: { GKP: 1, DEF: 5, MID: 5, FWD: 3 },
    });
  });
});
