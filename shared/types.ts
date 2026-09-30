// Shapes of the FPL Draft API responses we use. Only the fields we read are
// listed. See docs/fpl-draft-api.md and the real samples in fixtures/.

/** A manager in the league. `id` is used by matches and standings; `entry_id`
 * is used by transactions, trades, picks and the entry endpoints. They are
 * often different, so always map through this list. */
export interface LeagueEntry {
  id: number;
  entry_id: number;
  entry_name: string;
  player_first_name: string;
  player_last_name: string;
  short_name: string;
  waiver_pick: number;
  joined_time: string;
}

export interface Match {
  event: number;
  started: boolean;
  finished: boolean;
  league_entry_1: number;
  league_entry_1_points: number;
  league_entry_2: number;
  league_entry_2_points: number;
}

export interface LeagueDetails {
  league: {
    id: number;
    name: string;
    admin_entry: number;
    scoring: string;
    start_event: number;
    stop_event: number;
    trades: string;
    transaction_mode: string;
  };
  league_entries: LeagueEntry[];
  matches: Match[];
}

export interface GameStatus {
  current_event: number;
  current_event_finished: boolean;
  next_event: number;
  processing_status: string;
  trades_time_for_approval: boolean;
  waivers_processed: boolean;
}

/** What our Worker wraps every upstream response in. */
export interface Envelope<T> {
  data: T;
  /** ISO time the data was fetched from FPL. */
  fetchedAt: string;
  /** True when FPL couldn't be reached and this is an older copy. */
  stale: boolean;
}

export interface SiteConfig {
  leagueId: number;
  defaultEntryId: number;
}
