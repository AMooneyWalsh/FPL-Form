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

export interface TradeItem {
  /** Goes to the offering manager. */
  element_in: number;
  /** Goes to the receiving manager. */
  element_out: number;
}

export interface Trade {
  id: number;
  event: number;
  /** entry_id of the manager who made the offer. */
  offered_entry: number;
  /** entry_id of the manager who accepted it. */
  received_entry: number;
  offer_time: string;
  response_time: string | null;
  /** "p" = processed. Only processed trades are public. */
  state: string;
  tradeitem_set: TradeItem[];
}

export interface Transaction {
  id: number;
  entry: number;
  event: number;
  /** "w" waiver claim, "f" free agent pick-up. */
  kind: "w" | "f";
  /** "a" accepted; "di" lost the player to a higher claim; "do" the player
   * offered in exchange had already gone in an earlier successful claim. */
  result: "a" | "di" | "do";
  element_in: number;
  element_out: number;
  priority: number;
  added: string;
}

export interface DraftChoice {
  /** Overall pick number, 1 to (managers x 15), in snake order. */
  index: number;
  /** Pick number within the round (1 to managers), NOT the overall pick. */
  pick: number;
  round: number;
  /** entry_id */
  entry: number;
  element: number;
  was_auto: boolean;
  choice_time: string;
}

export interface Player {
  id: number;
  name: string;
  fullName: string;
  team: string;
  teamId: number;
  /** FPL's club code, used for shirt images. */
  teamCode: number;
  /** Opta player code; the Premier League's team sheets use the same id ("p" + code). Optional for old cached copies. */
  code?: number;
  position: "GKP" | "DEF" | "MID" | "FWD";
  totalPoints: number;
  /** FPL's pre-season draft ranking (lower = expected to be better). */
  draftRank: number;
  /** a available, d doubtful, i injured, s suspended, u unavailable, n not in squad. */
  status: string;
  /** Injury or suspension news, "" when there's none. */
  news: string;
  /** 0-100, or null when there's no doubt. */
  chanceNext: number | null;
  /** FPL's form: average points a game over the last 30 days. */
  form: number;
  pointsPerGame: number;
  /** FPL's expected points for next gameweek (null before it's set). */
  expectedNext: number | null;
  minutes: number;
  starts: number;
  /** Expected goals and assists this season. */
  xg: number;
  xa: number;
  /** Penalty taker order for his club (1 = first choice), null if not on them. */
  penaltiesOrder: number | null;
  /** When FPL added him to the game (ISO), e.g. a late summer signing. */
  added?: string;
}

/** An upcoming Premier League match, from bootstrap-static. */
export interface UpcomingFixture {
  event: number;
  home: number;
  away: number;
  kickoff: string | null;
  /** FPL's official 1 (easy) to 5 (hard) rating for each side, from the main game's API. */
  homeDifficulty?: number;
  awayDifficulty?: number;
}

/** Squad rules from bootstrap-static settings.squad. */
export interface SquadRules {
  /** Players in the XI. */
  play: number;
  /** How many of each position a squad has. */
  select: Record<Player["position"], number>;
  minPlay: Record<Player["position"], number>;
  maxPlay: Record<Player["position"], number>;
  /**
   * Defensive contribution ("DefCon") points: reach `limit` in a match and
   * get `points`. A limit of 0 means that position can't earn them (keepers).
   * Optional for old cached copies.
   */
  defcon?: { limit: Record<Player["position"], number>; points: Record<Player["position"], number> };
}

export interface PlayersPayload {
  players: Player[];
  rules: SquadRules;
  /** The next few gameweeks' fixtures (FPL sends about three). */
  fixtures: UpcomingFixture[];
  /** Trade, waiver and team deadlines for every gameweek not yet finished. */
  deadlines?: Deadlines[];
}

/** One gameweek's deadlines (ISO times, from bootstrap-static events). */
export interface Deadlines {
  event: number;
  trades: string;
  waivers: string;
  team: string;
}

/**
 * Official team sheets from the Premier League's own data feed, published
 * about an hour before kick-off (FPL only shows lineups after it).
 */
export interface TeamSheets {
  /** Clubs (FPL short names, e.g. "ARS") whose team sheet is out. */
  announced: string[];
  /** Opta player code to where they are on the sheet. Anyone at an announced club who isn't listed is out of the squad. */
  players: Record<number, "start" | "bench">;
}
