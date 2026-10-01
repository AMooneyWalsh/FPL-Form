// Cloudflare Worker: serves the built site and a small read-only API that
// fetches from the FPL Draft API, caches it, and falls back to the last good
// copy when FPL is down. See docs/architecture.md.

import { buildGameweek, type RawLive, type RawPicks } from "../shared/gameweek";
import { toLiveGameweek, type LivePicks, type RawLiveResponse } from "../shared/live";
import type { GameStatus, LeagueDetails, Player, PlayersPayload, SquadRules, UpcomingFixture } from "../shared/types";

export interface Env {
  LEAGUE_ID: string;
  DEFAULT_ENTRY_ID: string;
  /** The group's main-game FPL league; its leader is immune from a forfeit. */
  CLASSIC_LEAGUE_ID?: string;
  /** Optional: long-lived copies. The site works without it. */
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
/** Gameweeks that are over never change, so keep them for good. */
const FOREVER = Number.POSITIVE_INFINITY;

interface Route {
  upstream: (env: Env) => string;
  /** Seconds a fresh copy is reused before asking FPL again. */
  ttl: number;
  /** Optional reshaping, e.g. to trim a huge response down. */
  transform?: (raw: string) => string;
}

// Trades and waivers happen all week, so those stay on a short timer
// regardless of whether matches are on.
export const ROUTES: Record<string, Route> = {
  game: { upstream: () => "game", ttl: MINUTE },
  league: { upstream: (env) => `league/${env.LEAGUE_ID}/details`, ttl: 2 * MINUTE },
  trades: { upstream: (env) => `draft/league/${env.LEAGUE_ID}/trades`, ttl: 2 * MINUTE },
  transactions: { upstream: (env) => `draft/league/${env.LEAGUE_ID}/transactions`, ttl: 2 * MINUTE },
  ownership: { upstream: (env) => `league/${env.LEAGUE_ID}/element-status`, ttl: 2 * MINUTE },
  draft: { upstream: (env) => `draft/${env.LEAGUE_ID}/choices`, ttl: 6 * HOUR, transform: trimDraft },
  players: { upstream: () => "bootstrap-static", ttl: HOUR, transform: trimPlayers },
  // Fixture difficulty ratings only exist on the main FPL game's API (same club ids as Draft).
  fdr: { upstream: () => FPL_FIXTURES, ttl: 6 * HOUR, transform: trimFixtures },
  classic: {
    upstream: (env) => `https://fantasy.premierleague.com/api/leagues-classic/${env.CLASSIC_LEAGUE_ID ?? "2757"}/standings/`,
    ttl: 30 * MINUTE,
    transform: trimClassic,
  },
};

interface Cached {
  body: string;
  fetchedAt: number;
  /** A finished gameweek: never needs fetching again. */
  final?: boolean;
}

// Per-isolate memory cache (the Cache API does nothing on workers.dev).
// KV covers "FPL is down and this isolate is new", and finished gameweeks.
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
    const gwMatch = /^gw\/(\d{1,2})$/.exec(name);
    if (gwMatch) {
      return serveGameweek(Number(gwMatch[1]), env, ctx);
    }
    const liveMatch = /^live\/(\d{1,2})$/.exec(name);
    if (liveMatch) {
      return serveLive(Number(liveMatch[1]), env, ctx);
    }
    const shirtMatch = /^shirt\/(\d{1,3})(_1)?$/.exec(name);
    if (shirtMatch) {
      return serveShirt(shirtMatch[1], !!shirtMatch[2], ctx);
    }
    const route = ROUTES[name];
    if (!route) {
      return json({ error: "Not found" }, 404);
    }
    return respond(() =>
      cached(`${env.LEAGUE_ID}:${name}`, route.ttl, env, ctx, async () => {
        const raw = await fetchUpstream(route.upstream(env));
        return route.transform ? route.transform(raw) : raw;
      }),
    );
  },
} satisfies ExportedHandler<Env>;

/**
 * Every player's points and every manager's squad for one gameweek. Past
 * gameweeks are stored for good; the current one refreshes every 2 minutes.
 */
async function serveGameweek(event: number, env: Env, ctx: ExecutionContext): Promise<Response> {
  const key = `${env.LEAGUE_ID}:gw:${event}`;
  const final = await readFinal(key, env);
  if (final) return envelope(final, false, HOUR);

  return respond(async () => {
    const game = JSON.parse(
      (await cached(`${env.LEAGUE_ID}:game`, ROUTES.game.ttl, env, ctx, () => fetchUpstream("game"))).value.body,
    ) as GameStatus;
    if (event < 1 || event > game.current_event) {
      throw new NotFound("That gameweek hasn't started yet.");
    }
    const isOver = event < game.current_event;
    return cached(key, isOver ? FOREVER : 2 * MINUTE, env, ctx, async () => {
      const league = JSON.parse(
        (await cached(`${env.LEAGUE_ID}:league`, ROUTES.league.ttl, env, ctx, () => fetchUpstream(ROUTES.league.upstream(env)))).value.body,
      ) as LeagueDetails;
      const [live, ...picks] = await Promise.all([
        fetchUpstream(`event/${event}/live`),
        ...league.league_entries.map((e) => fetchUpstream(`entry/${e.entry_id}/event/${event}`)),
      ]);
      const byEntry: Record<number, RawPicks> = {};
      league.league_entries.forEach((e, i) => (byEntry[e.entry_id] = JSON.parse(picks[i]) as RawPicks));
      return JSON.stringify(buildGameweek(event, JSON.parse(live) as RawLive, byEntry));
    }, isOver);
  });
}

/**
 * Live scoring data for one gameweek: every player's live points and BPS,
 * the Premier League fixtures, and each manager's lineup (once the deadline
 * has passed). Refreshes every minute while games are on.
 */
async function serveLive(event: number, env: Env, ctx: ExecutionContext): Promise<Response> {
  return respond(async () => {
    const game = JSON.parse(
      (await cached(`${env.LEAGUE_ID}:game`, ROUTES.game.ttl, env, ctx, () => fetchUpstream("game"))).value.body,
    ) as GameStatus;
    if (event < 1 || event > game.current_event + 1) {
      throw new NotFound("No live data for that gameweek.");
    }
    const inPlay = event === game.current_event && !game.current_event_finished;
    const ttl = inPlay ? MINUTE : event === game.current_event ? 10 * MINUTE : HOUR;
    return cached(`${env.LEAGUE_ID}:live:${event}`, ttl, env, ctx, async () => {
      const league = JSON.parse(
        (await cached(`${env.LEAGUE_ID}:league`, ROUTES.league.ttl, env, ctx, () => fetchUpstream(ROUTES.league.upstream(env)))).value.body,
      ) as LeagueDetails;
      const [live, ...picks] = await Promise.all([
        fetchUpstream(`event/${event}/live`),
        // Lineups are hidden until the deadline, so a missing one isn't an error.
        ...league.league_entries.map((e) => fetchUpstream(`entry/${e.entry_id}/event/${event}`).catch(() => null)),
      ]);
      const byEntry: Record<number, LivePicks> = {};
      league.league_entries.forEach((e, i) => {
        const raw = picks[i];
        if (!raw) return;
        const p = JSON.parse(raw) as LivePicks;
        byEntry[e.entry_id] = { picks: p.picks.map((x) => ({ element: x.element, position: x.position })), subs: p.subs ?? [] };
      });
      return JSON.stringify(toLiveGameweek(event, JSON.parse(live) as RawLiveResponse, byEntry));
    });
  });
}

class NotFound extends Error {}

interface Result {
  value: Cached;
  stale: boolean;
  ttl: number;
}

/**
 * Returns a fresh-enough copy, fetching with `load` when needed. If FPL fails,
 * falls back to the last copy we have (memory, then KV) marked stale.
 */
async function cached(
  key: string,
  ttl: number,
  env: Env,
  ctx: ExecutionContext,
  load: () => Promise<string>,
  permanent = false,
): Promise<Result> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && now - hit.fetchedAt < ttl * 1000) {
    return { value: hit, stale: false, ttl };
  }
  try {
    const fresh: Cached = permanent ? { body: await load(), fetchedAt: now, final: true } : { body: await load(), fetchedAt: now };
    memory.set(key, fresh);
    if (env.LAST_GOOD && (permanent || now - (lastKvWrite.get(key) ?? 0) > KV_WRITE_INTERVAL_MS)) {
      lastKvWrite.set(key, now);
      ctx.waitUntil(env.LAST_GOOD.put(key, JSON.stringify(fresh)).catch(() => {}));
    }
    return { value: fresh, stale: false, ttl };
  } catch (err) {
    console.error(`Loading ${key} failed:`, err);
    const fallback = hit ?? (await readKv(env, key));
    if (fallback) return { value: fallback, stale: true, ttl: MINUTE };
    throw err;
  }
}

async function respond(get: () => Promise<Result>): Promise<Response> {
  try {
    const { value, stale, ttl } = await get();
    return envelope(value, stale, ttl);
  } catch (err) {
    if (err instanceof NotFound) return json({ error: err.message }, 404);
    return json({ error: "FPL is not responding and there is no saved copy yet." }, 502);
  }
}

/**
 * Club shirt images, passed through from FPL's image server so the browser
 * loads them from our own address (some phones block FPL's image host).
 * Cached at Cloudflare's edge for a week.
 */
async function serveShirt(code: string, keeper: boolean, ctx: ExecutionContext): Promise<Response> {
  const src = `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${code}${keeper ? "_1" : ""}-66.png`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(src);
  const hit = await cache?.match(key);
  if (hit) return hit;
  try {
    const res = await fetch(src, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
      return json({ error: "No shirt" }, 404, 3600);
    }
    const out = new Response(res.body, {
      headers: { "Content-Type": res.headers.get("content-type")!, "Cache-Control": "public, max-age=604800" },
    });
    if (cache) ctx.waitUntil(cache.put(key, out.clone()));
    return out;
  } catch {
    return json({ error: "No shirt" }, 502, 60);
  }
}

async function fetchUpstream(path: string): Promise<string> {
  const res = await fetch(path.startsWith("https://") ? path : UPSTREAM + path, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${path}`);
  }
  const body = await res.text();
  // FPL sometimes answers with an HTML maintenance page. Only keep real JSON.
  const parsed: unknown = JSON.parse(body);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`Unexpected response shape for ${path}`);
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

async function readFinal(key: string, env: Env): Promise<Cached | null> {
  const hit = memory.get(key);
  if (hit?.final) return hit;
  const stored = await readKv(env, key);
  if (stored?.final) {
    memory.set(key, stored);
    return stored;
  }
  return null;
}

// ---------------------------------------------------------------- trimming

const POSITIONS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as const;

interface RawBootstrap {
  elements: {
    id: number;
    web_name: string;
    first_name: string;
    second_name: string;
    team: number;
    element_type: 1 | 2 | 3 | 4;
    total_points: number;
    draft_rank: number;
    status: string;
    news: string;
    chance_of_playing_next_round: number | null;
    form: string;
    points_per_game: string;
    ep_next: string | null;
    minutes: number;
    starts: number;
    expected_goals: string;
    expected_assists: string;
    penalties_order: number | null;
    added?: string;
  }[];
  teams: { id: number; short_name: string; code: number }[];
  settings: { squad: Record<string, number> };
  fixtures?: Record<string, { event: number; team_h: number; team_a: number; kickoff_time: string | null }[]>;
}

/** bootstrap-static is ~1 MB; phones only need a few fields per player,
 * plus the squad rules. */
export function trimPlayers(raw: string): string {
  const b = JSON.parse(raw) as RawBootstrap;
  const teams = new Map(b.teams.map((t) => [t.id, t.short_name]));
  const codes = new Map(b.teams.map((t) => [t.id, t.code]));
  const players: Player[] = b.elements.map((e) => ({
    id: e.id,
    name: e.web_name,
    fullName: `${e.first_name} ${e.second_name}`,
    team: teams.get(e.team) ?? "",
    teamId: e.team,
    teamCode: codes.get(e.team) ?? 0,
    position: POSITIONS[e.element_type],
    totalPoints: e.total_points,
    draftRank: e.draft_rank,
    status: e.status,
    news: e.news ?? "",
    chanceNext: e.chance_of_playing_next_round ?? null,
    form: Number(e.form) || 0,
    pointsPerGame: Number(e.points_per_game) || 0,
    expectedNext: e.ep_next === null || e.ep_next === undefined ? null : Number(e.ep_next),
    minutes: e.minutes,
    starts: e.starts,
    xg: Number(e.expected_goals) || 0,
    xa: Number(e.expected_assists) || 0,
    penaltiesOrder: e.penalties_order ?? null,
    added: e.added,
  }));
  const fixtures = Object.values(b.fixtures ?? {})
    .flat()
    .map((f) => ({ event: f.event, home: f.team_h, away: f.team_a, kickoff: f.kickoff_time }));
  const sq = b.settings.squad;
  const byPos = (prefix: string) =>
    Object.fromEntries(Object.values(POSITIONS).map((pos) => [pos, sq[`${prefix}${pos}`]])) as SquadRules["select"];
  const payload: PlayersPayload = {
    players,
    rules: { play: sq.play, select: byPos("select_"), minPlay: byPos("min_play_"), maxPlay: byPos("max_play_") },
    fixtures,
  };
  return JSON.stringify(payload);
}

const FPL_FIXTURES = "https://fantasy.premierleague.com/api/fixtures/?future=1";

/** Main-game fixtures still to be played, with FPL's 1-5 difficulty for each side. */
export function trimFixtures(raw: string): string {
  const list = JSON.parse(raw) as {
    event: number | null;
    team_h: number;
    team_a: number;
    team_h_difficulty: number;
    team_a_difficulty: number;
    kickoff_time: string | null;
  }[];
  if (!Array.isArray(list)) throw new Error("Unexpected fixtures shape");
  const fixtures: UpcomingFixture[] = list
    .filter((f) => f.event !== null)
    .map((f) => ({
      event: f.event as number,
      home: f.team_h,
      away: f.team_a,
      kickoff: f.kickoff_time,
      homeDifficulty: f.team_h_difficulty,
      awayDifficulty: f.team_a_difficulty,
    }));
  return JSON.stringify({ fixtures });
}

/** The main-game league table, cut down to name, rank and total. */
export function trimClassic(raw: string): string {
  const d = JSON.parse(raw) as { standings?: { results?: { player_name: string; rank: number; total: number }[] } };
  const results = d.standings?.results;
  if (!Array.isArray(results)) throw new Error("Unexpected classic league shape");
  return JSON.stringify({ standings: results.map((r) => ({ name: r.player_name, rank: r.rank, total: r.total })) });
}

/** The choices endpoint also carries every player's status; keep just the picks. */
function trimDraft(raw: string): string {
  const d = JSON.parse(raw) as { choices: unknown[] };
  return JSON.stringify({ choices: d.choices });
}

// ---------------------------------------------------------------- responses

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
