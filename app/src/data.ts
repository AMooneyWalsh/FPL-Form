import { useEffect, useMemo, useState } from "react";
import type { Gameweek } from "../../shared/gameweek";
import { cancelReversals, Seasons, type Reversal } from "../../shared/moves";
import { managerLabels } from "../../shared/standings";
import type {
  DraftChoice,
  Envelope,
  GameStatus,
  LeagueDetails,
  LeagueEntry,
  Player,
  PlayersPayload,
  SquadRules,
  SiteConfig,
  Trade,
  Transaction,
  UpcomingFixture,
} from "../../shared/types";
import { useApi, type Loadable } from "./api";

/** Everything the pages need, loaded together and kept fresh. */
export interface LeagueData {
  config: SiteConfig;
  league: LeagueDetails;
  game: GameStatus;
  players: Map<number, Player>;
  playerList: Player[];
  rules: SquadRules;
  /** Processed trades, with same-gameweek swap-backs cancelled out. */
  trades: Trade[];
  reversals: Reversal[];
  transactions: Transaction[];
  draft: DraftChoice[];
  /** Who owns each player right now (entry_id), null for free agents. */
  owners: Map<number, number | null>;
  /** The next few gameweeks' Premier League fixtures. */
  fixtures: UpcomingFixture[];
  seasons: Seasons;
  entries: Map<number, LeagueEntry>;
  /** Short manager names keyed by entry_id. */
  labels: Map<number, string>;
  /** When the fast-moving data (league, trades, waivers) was last fetched. */
  fetchedAt: string;
  stale: boolean;
  /** The current gameweek has started but FPL hasn't marked it finished. */
  inProgress: boolean;
  /** Gameweeks that couldn't be loaded (retried in the background). */
  missingGameweeks: number[];
}

const REFRESH = 120;

export function useLeagueData(): Loadable<LeagueData> {
  const config = useApi<SiteConfig>("/api/config", 3600);
  const league = useApi<Envelope<LeagueDetails>>("/api/league", REFRESH);
  const game = useApi<Envelope<GameStatus>>("/api/game", REFRESH);
  const players = useApi<Envelope<PlayersPayload>>("/api/players", 3600);
  const trades = useApi<Envelope<{ trades: Trade[] }>>("/api/trades", REFRESH);
  const transactions = useApi<Envelope<{ transactions: Transaction[] }>>("/api/transactions", REFRESH);
  const draft = useApi<Envelope<{ choices: DraftChoice[] }>>("/api/draft", 3600);
  const ownership = useApi<Envelope<{ element_status: { element: number; owner: number | null }[] }>>(
    "/api/ownership",
    REFRESH,
  );
  const gameweeks = useGameweeks(game.status === "ready" ? game.value.data.current_event : null);

  return useMemo((): Loadable<LeagueData> => {
    const all = [config, league, game, players, trades, transactions, draft, ownership, gameweeks];
    const failed = all.find((x) => x.status === "error");
    if (failed?.status === "error") return failed;
    if (
      config.status !== "ready" ||
      league.status !== "ready" ||
      game.status !== "ready" ||
      players.status !== "ready" ||
      trades.status !== "ready" ||
      transactions.status !== "ready" ||
      draft.status !== "ready" ||
      ownership.status !== "ready" ||
      gameweeks.status !== "ready"
    ) {
      return { status: "loading" };
    }
    const envelopes = [league.value, game.value, players.value, trades.value, transactions.value, draft.value];
    // Players and draft picks only refresh hourly, so leave them out of "Updated X ago".
    const fast = [league.value, game.value, trades.value, transactions.value, ownership.value];
    const entries = league.value.data.league_entries;
    const effective = cancelReversals(trades.value.data.trades);
    return {
      status: "ready",
      value: {
        config: config.value,
        league: league.value.data,
        game: game.value.data,
        players: new Map(players.value.data.players.map((p) => [p.id, p])),
        playerList: players.value.data.players,
        rules: players.value.data.rules,
        trades: effective.trades,
        reversals: effective.reversals,
        transactions: transactions.value.data.transactions,
        draft: draft.value.data.choices,
        owners: new Map(ownership.value.data.element_status.map((s) => [s.element, s.owner])),
        fixtures: players.value.data.fixtures ?? [],
        seasons: new Seasons(gameweeks.value.loaded),
        entries: new Map(entries.map((e) => [e.entry_id, e])),
        labels: managerLabels(entries),
        fetchedAt: fast.map((e) => e.fetchedAt).sort()[0],
        stale: envelopes.some((e) => e.stale),
        inProgress: game.value.data.current_event >= 1 && !game.value.data.current_event_finished,
        missingGameweeks: gameweeks.value.missing,
      },
    };
  }, [config, league, game, players, trades, transactions, draft, ownership, gameweeks]);
}

/**
 * Loads GW1..current. Finished ones load once; the current one refreshes.
 * A gameweek that fails doesn't stop the site loading: it's listed as missing
 * and retried on the next refresh.
 */
function useGameweeks(current: number | null): Loadable<{ loaded: Gameweek[]; missing: number[] }> {
  const [state, setState] = useState<Loadable<{ loaded: Gameweek[]; missing: number[] }>>({ status: "loading" });
  useEffect(() => {
    if (current === null) return;
    if (current < 1) {
      // Pre-season: no gameweeks yet.
      setState({ status: "ready", value: { loaded: [], missing: [] } });
      return;
    }
    let cancelled = false;
    const done = new Map<number, Gameweek>();
    const get = async (n: number) => {
      const res = await fetch(`/api/gw/${n}`);
      if (!res.ok) throw new Error(`Couldn't load gameweek ${n}.`);
      return ((await res.json()) as Envelope<Gameweek>).data;
    };
    const load = async (refresh: boolean) => {
      const all = Array.from({ length: current }, (_, i) => i + 1);
      // First load: everything. Refreshes: the current gameweek plus any that failed.
      const wanted = refresh ? all.filter((n) => n === current || !done.has(n)) : all;
      const results = await Promise.allSettled(wanted.map(get));
      results.forEach((r) => r.status === "fulfilled" && done.set(r.value.event, r.value));
      if (cancelled) return;
      const missing = all.filter((n) => !done.has(n));
      if (missing.length === all.length) {
        setState((s) => (s.status === "ready" ? s : { status: "error", message: "Couldn't load any gameweeks." }));
        return;
      }
      setState({ status: "ready", value: { loaded: [...done.values()].sort((a, b) => a.event - b.event), missing } });
    };
    load(false);
    const timer = window.setInterval(() => load(true), REFRESH * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [current]);
  return state;
}
