# FPL Draft API notes

Status: every endpoint in the table below was verified on 2026-09-30, no login needed. The cloud environment's network policy now allows `draft.premierleague.com`. Real responses for league 634 after GW5 are saved in `fixtures/`.

The API is unofficial and undocumented, so it can change without notice. Base URL: `https://draft.premierleague.com/api/`

| Endpoint | Gives you |
|---|---|
| `bootstrap-static` | Players (`elements`), teams, gameweeks (`events`), scoring and league rule settings. This is the `bootstrapData` block. |
| `league/{id}/details` | League settings, `league_entries`, H2H `matches`, `standings`. This is `leagueData`. |
| `draft/league/{id}/transactions` | Waiver and free agent transactions. This is `transactionData`. |
| `draft/league/{id}/trades` | Trades. This is `tradeData`. |
| `event/{gw}/live` | Live per-player stats and points for a gameweek. Needed for live scoring. |
| `entry/{entry_id}/event/{gw}` | A manager's squad and picks for a gameweek (starting XI, bench, captain-less in draft). |
| `draft/{league_id}/choices` | All draft picks in order (`pick`, `round`, `element`, `entry`, `was_auto`, `choice_time`). Note it's the league ID, not a gameweek. |
| `league/{id}/element-status` | Which player is owned by which entry (`owner` is an `entry_id`, or null). |
| `game` | Current and next gameweek, whether it's finished, whether waivers have been processed. Small, good for deciding refresh rates. |
| `entry/{entry_id}/public` | Team name, total points, `league_set` (the leagues the team is in). |

## Things to know

- Reads for a league don't need auth as far as the current data suggests. Anything that changes state (making picks, waivers, trades) needs a logged-in FPL session, so a third-party site can't do those.
- The browser can't call it directly from another origin if CORS isn't allowed, so a live site needs a small proxy or scheduled fetch. The existing repo gets round this by committing `data.json`.
- Be polite on rate: cache, and don't poll faster than needed.

## Findings from the 2026-09-30 check

- **League IDs are not stable across seasons.** ID 6573 was "Drafty In Here" in 2025/26 and is now an unrelated league ("Ball Knowledge 4.0"). The league ID must be config, set each season, never hardcoded.
- `standings[].matches_played` returned 38 after only 5 gameweeks. Don't trust it. Count finished matches instead.
- `winning_league_entry` and `winning_method` were null on every finished match, including non-draws. Work out results from the points.
- Future matches are listed with `started: false` and 0 points, so filter on `finished`.
- Opening the URL in a browser tab doesn't prove cross-origin `fetch` from our site is allowed (CORS). That doesn't matter because the Worker makes the requests server side.
- **Two different IDs per manager.** `league_entries[].entry_id` (the team, used by transactions, picks and `entry/{id}/...`) and `league_entries[].id` (the league entry, used by `matches` and `standings`) are equal for some managers and different for others (e.g. 1848 vs 1849). Always map between them via `league_entries`, never assume they match.
- A sample response for league 634 after GW5 is saved in `fixtures/league-634-details.json` for tests.

## Shapes worth knowing (from the GW5 fixtures)

- `trades[]`: `offered_entry`, `received_entry` (entry_ids), `event`, `state` (`p` processed; only processed trades appear), `tradeitem_set[]` of `{element_in, element_out}`: the offering manager receives `element_in`, the receiving manager gets `element_out`. Managers sometimes pass a traded player straight on in another trade the same GW, so squads, not trades, are the truth for who owned whom.
- `transactions[]`: `entry`, `event` (the GW the move applies to), `kind` (`w` waiver, `f` free agent), `result` (`a` accepted, `di` lost to a higher claim, `do` the player being dropped had already gone in an earlier accepted claim; both checked against all 232 denials by GW5), `element_in`, `element_out`, `priority`, `added`. 388 rows by GW5, so waiver battles have plenty of data.
- `choices[]`: 210 picks (14 managers x 15 rounds, snake order). **`index` is the overall pick (1 to 210); `pick` is the pick within the round (1 to 14).** Easy to mix up.
- `entry/{id}/event/{gw}`: `picks[]` with `position` 1 to 15 (12 to 15 is the bench) plus `subs[]` (auto-subs FPL applied) and `entry_history`.
- `event/{gw}/live`: `elements` keyed by player id with `stats` (incl. `total_points`, `minutes`, `bps`, `bonus`) and `explain`, plus `fixtures`.
- `game.trades_time_for_approval: true` means trades go through an approval window before processing.
- Working out every H2H score from squads (starting XI after `subs`, summing `event/{gw}/live` `total_points`) reproduces all 70 GW1-5 scores exactly. No captains in Draft.
- `bootstrap-static.elements[].draft_rank` is FPL's pre-season draft ranking, useful for draft analysis.

## The main FPL game's API

The Draft API has no fixture difficulty ratings. The main game's public API does: `https://fantasy.premierleague.com/api/fixtures/?future=1` gives every unplayed fixture with `team_h_difficulty` and `team_a_difficulty` (1 easy to 5 hard, each from that side's point of view). Club ids match the Draft API's. The Worker serves it trimmed as `/api/fdr`.
