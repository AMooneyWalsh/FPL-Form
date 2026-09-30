# FPL Draft API notes

Status: `league/{id}/details` verified from a browser on 2026-09-30 (no login needed). The others come from the shape of `data.json` and general knowledge of the unofficial API, and still need checking. The cloud sandbox can't reach `draft.premierleague.com`.

The API is unofficial and undocumented, so it can change without notice. Base URL: `https://draft.premierleague.com/api/`

| Endpoint | Gives you |
|---|---|
| `bootstrap-static` | Players (`elements`), teams, gameweeks (`events`), scoring and league rule settings. This is the `bootstrapData` block. |
| `league/{id}/details` | League settings, `league_entries`, H2H `matches`, `standings`. This is `leagueData`. |
| `draft/league/{id}/transactions` | Waiver and free agent transactions. This is `transactionData`. |
| `draft/league/{id}/trades` | Trades. This is `tradeData`. |
| `event/{gw}/live` | Live per-player stats and points for a gameweek. Needed for live scoring. |
| `entry/{entry_id}/event/{gw}` | A manager's squad and picks for a gameweek (starting XI, bench, captain-less in draft). |
| `draft/{gw}/choices` | Draft picks, in order. Would replace the hardcoded `DRAFT_PICKS`. |
| `league/{id}/element-status` | Which player is owned by which entry. |

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
