# Existing app (as of 2026-09-30)

## Files

| File | What it is |
|---|---|
| `index.html` | Whole app: CSS, markup and ~3k lines of vanilla JS. No framework, no build. |
| `data.json` | ~1.6 MB snapshot of the league, fetched at page load (`fetch('data.json?cb=...')`). Falls back to a paste box if the fetch fails. |
| `README.md` | One line. |

History is 37 commits, mostly "Update League Data" (data refreshes made by hand, not CI).

## data.json shape

Top level keys, each a copy of an official FPL Draft API response:

- `leagueData`: `league_entries` (12 managers), `matches` (228 H2H results), `league` (settings), `standings`
- `transactionData.transactions`: 1,773 waiver/free agent rows
- `tradeData.trades`: 104 trades
- `bootstrapData`: `events` (38 GWs), `elements` (838 players, 69 fields each), `fixtures`, `teams`, `element_types`, `element_stats`, `settings` (scoring, squad, transactions, league rules)

League config seen in the data: name "Drafty In Here", id 6573, `scoring: "h"` (head to head), `transaction_mode: "waivers"`, trades on, 30s pick timer, drafted 2025-08-09, admin entry 25982.

## Tabs

Results (standings, form, luck, charts, streaks, records, H2H), Transfers (waivers, trades, player search), Draft (draft value, best XI).

## Known rough edges

- Draft picks are hardcoded in `index.html` (`DRAFT_PICKS`), with manager first names and some wrong-looking player ids.
- Some CSS uses curly quotes in `url(...)` (line ~344), so that background won't load.
- Data refresh is manual.
- Single league only, hardwired.

## Rebuilt in the new site (2026-09-30)

Every part of the old Results tab now has a home on the new site's **League** tab:

| Old | New |
|---|---|
| Standings + position-by-GW chart | League > Table (the chart highlights your team plus one to compare) |
| Form (last 3/5/10/all) | League > Form |
| Fixture luck (median-based expected wins), verdict cards, points against | League > Luck (with a week-by-week strip marking "robbed" and "jammy" weeks) |
| Head to head | League > Head to head (adds next meeting) |
| Streaks, highest/lowest scores, biggest margins, lowest winning, highest losing | League > Records |
| Transfers tab | Trades, Waivers and Players tabs |
| Draft tab (hardcoded picks) | Draft tab (from the API) |

Not carried over: the points-against line and bar charts (the average is a column in the Luck table instead), and the paste-JSON fallback (the Worker serves saved data if FPL is down).
