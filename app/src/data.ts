import { useEffect, useMemo, useState } from "react";
import type { Gameweek } from "../../shared/gameweek";
import { Seasons } from "../../shared/moves";
import { managerLabels } from "../../shared/standings";
import type {
  DraftChoice,
  Envelope,
  GameStatus,
  LeagueDetails,
  LeagueEntry,
  Player,
  SiteConfig,
  Trade,
  Transaction,
} from "../../shared/types";
import { useApi, type Loadable } from "./api";

/** Everything the pages need, loaded together and kept fresh. */
export interface LeagueData {
  config: SiteConfig;
  league: LeagueDetails;
  game: GameStatus;
  players: Map<number, Player>;
  trades: Trade[];
  transactions: Transaction[];
  draft: DraftChoice[];
  seasons: Seasons;
  entries: Map<number, LeagueEntry>;
  /** Short manager names keyed by entry_id. */
  labels: Map<number, string>;
  fetchedAt: string;
  stale: boolean;
}

const REFRESH = 120;

export function useLeagueData(): Loadable<LeagueData> {
  const config = useApi<SiteConfig>("/api/config", 3600);
  const league = useApi<Envelope<LeagueDetails>>("/api/league", REFRESH);
  const game = useApi<Envelope<GameStatus>>("/api/game", REFRESH);
  const players = useApi<Envelope<Player[]>>("/api/players", 3600);
  const trades = useApi<Envelope<{ trades: Trade[] }>>("/api/trades", REFRESH);
  const transactions = useApi<Envelope<{ transactions: Transaction[] }>>("/api/transactions", REFRESH);
  const draft = useApi<Envelope<{ choices: DraftChoice[] }>>("/api/draft", 3600);
  const gameweeks = useGameweeks(game.status === "ready" ? game.value.data.current_event : 0);

  return useMemo((): Loadable<LeagueData> => {
    const all = [config, league, game, players, trades, transactions, draft, gameweeks];
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
      gameweeks.status !== "ready"
    ) {
      return { status: "loading" };
    }
    const envelopes = [league.value, game.value, players.value, trades.value, transactions.value, draft.value];
    const entries = league.value.data.league_entries;
    return {
      status: "ready",
      value: {
        config: config.value,
        league: league.value.data,
        game: game.value.data,
        players: new Map(players.value.data.map((p) => [p.id, p])),
        trades: trades.value.data.trades,
        transactions: transactions.value.data.transactions,
        draft: draft.value.data.choices,
        seasons: new Seasons(gameweeks.value),
        entries: new Map(entries.map((e) => [e.entry_id, e])),
        labels: managerLabels(entries),
        fetchedAt: envelopes.map((e) => e.fetchedAt).sort()[0],
        stale: envelopes.some((e) => e.stale),
      },
    };
  }, [config, league, game, players, trades, transactions, draft, gameweeks]);
}

/** Loads GW1..current. Finished ones load once; the current one refreshes. */
function useGameweeks(current: number): Loadable<Gameweek[]> {
  const [state, setState] = useState<Loadable<Gameweek[]>>({ status: "loading" });
  useEffect(() => {
    if (current < 1) return;
    let cancelled = false;
    const done = new Map<number, Gameweek>();
    const get = async (n: number) => {
      const res = await fetch(`/api/gw/${n}`);
      if (!res.ok) throw new Error(`Couldn't load gameweek ${n}`);
      return ((await res.json()) as Envelope<Gameweek>).data;
    };
    const load = async (onlyCurrent: boolean) => {
      const wanted = onlyCurrent ? [current] : Array.from({ length: current }, (_, i) => i + 1);
      const loaded = await Promise.all(wanted.map(get));
      loaded.forEach((g) => done.set(g.event, g));
      if (!cancelled) setState({ status: "ready", value: [...done.values()] });
    };
    load(false).catch((err: Error) => !cancelled && setState({ status: "error", message: err.message }));
    const timer = window.setInterval(() => load(true).catch(() => {}), REFRESH * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [current]);
  return state;
}
