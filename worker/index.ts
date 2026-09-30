// Cloudflare Worker: serves the built site and a small read-only API that
// fetches from the FPL Draft API, caches it, and falls back to the last good
// copy when FPL is down. See docs/architecture.md.

export interface Env {
  LEAGUE_ID: string;
  DEFAULT_ENTRY_ID: string;
  /** Optional: long-lived "last good" copies. The site works without it. */
  LAST_GOOD?: KVNamespace;
  ASSETS: Fetcher;
}

const UPSTREAM = "https://draft.premierleague.com/api/";
const USER_AGENT = "DraftyInHere/1.0 (+https://github.com/amooneywalsh/fpl-form)";
const UPSTREAM_TIMEOUT_MS = 10_000;
/** Don't write the same key to KV more often than this (free tier limits). */
const KV_WRITE_INTERVAL_MS = 30 * 60_000;

const MINUTE = 60;
const HOUR = 60 * MINUTE;

interface Route {
  upstream: (env: Env) => string;
  /** Seconds a fresh copy is reused before asking FPL again. */
  ttl: number;
}

// Trades and waivers happen all week, so those stay on a short timer
// regardless of whether matches are on.
export const ROUTES: Record<string, Route> = {
  game: { upstream: () => "game", ttl: MINUTE },
  league: { upstream: (env) => `league/${env.LEAGUE_ID}/details`, ttl: 2 * MINUTE },
  trades: { upstream: (env) => `draft/league/${env.LEAGUE_ID}/trades`, ttl: 2 * MINUTE },
  transactions: { upstream: (env) => `draft/league/${env.LEAGUE_ID}/transactions`, ttl: 2 * MINUTE },
  ownership: { upstream: (env) => `league/${env.LEAGUE_ID}/element-status`, ttl: 2 * MINUTE },
  draft: { upstream: (env) => `draft/${env.LEAGUE_ID}/choices`, ttl: 6 * HOUR },
  bootstrap: { upstream: () => "bootstrap-static", ttl: HOUR },
};

interface Cached {
  body: string;
  fetchedAt: number;
}

// Per-isolate memory cache. With a small group this is plenty; KV covers the
// "FPL is down and this isolate is new" case.
const memory = new Map<string, Cached>();
const lastKvWrite = new Map<string, number>();

export function resetCachesForTests() {
  memory.clear();
  lastKvWrite.clear();
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== "GET") {
      return json({ error: "Read only" }, 405);
    }
    const name = url.pathname.slice("/api/".length).replace(/\/$/, "");
    if (name === "config") {
      return json({ leagueId: Number(env.LEAGUE_ID), defaultEntryId: Number(env.DEFAULT_ENTRY_ID) }, 200, 300);
    }
    const route = ROUTES[name];
    if (!route) {
      return json({ error: "Not found" }, 404);
    }
    return serve(name, route, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function serve(name: string, route: Route, env: Env, ctx: ExecutionContext): Promise<Response> {
  const key = `${env.LEAGUE_ID}:${name}`;
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && now - hit.fetchedAt < route.ttl * 1000) {
    return envelope(hit, false, route.ttl);
  }

  try {
    const body = await fetchUpstream(route.upstream(env));
    const fresh = { body, fetchedAt: now };
    memory.set(key, fresh);
    if (env.LAST_GOOD && now - (lastKvWrite.get(key) ?? 0) > KV_WRITE_INTERVAL_MS) {
      lastKvWrite.set(key, now);
      ctx.waitUntil(env.LAST_GOOD.put(key, JSON.stringify(fresh)).catch(() => {}));
    }
    return envelope(fresh, false, route.ttl);
  } catch (err) {
    console.error(`Upstream ${name} failed:`, err);
    const fallback = hit ?? (await readKv(env, key));
    if (fallback) {
      return envelope(fallback, true, MINUTE);
    }
    return json({ error: "FPL is not responding and there is no saved copy yet." }, 502);
  }
}

async function fetchUpstream(path: string): Promise<string> {
  const res = await fetch(UPSTREAM + path, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const body = await res.text();
  // FPL sometimes answers with an HTML maintenance page. Only keep real JSON.
  const parsed: unknown = JSON.parse(body);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Unexpected response shape");
  }
  return body;
}

async function readKv(env: Env, key: string): Promise<Cached | null> {
  if (!env.LAST_GOOD) return null;
  try {
    const raw = await env.LAST_GOOD.get(key);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

function envelope(c: Cached, stale: boolean, maxAge: number): Response {
  // Built by hand so large responses aren't parsed and re-serialised.
  const body = `{"fetchedAt":${JSON.stringify(new Date(c.fetchedAt).toISOString())},"stale":${stale},"data":${c.body}}`;
  return new Response(body, { headers: headers(Math.min(maxAge, MINUTE)) });
}

function json(value: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(value), { status, headers: headers(maxAge) });
}

function headers(maxAge: number): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store",
  };
}
