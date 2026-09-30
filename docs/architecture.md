# Architecture (draft for review)

Status: agreed 2026-09-30. Steps 1 and 2 built.

---

## Part 1: The plain-English version

### What the site does

A website for Drafty In Here that shows:

The focus is on what draftfpl.live and the official site **don't** do well: **trade analysis and draft analysis**.

1. **Trades and waivers.** Who won each trade, who's traded with whom, waiver battles, and how every move has worked out since. Refreshed every few minutes, all week, because trades happen any day.
2. **Draft analysis.** How every pick has aged: steals, busts, how much of each squad is still from the draft.
3. **The table and the stats.** Standings, form, luck, streaks, records, head-to-head history, like the old site but always up to date.
4. **Later:** a live gameweek page, then waiver suggestions.

When you open it, it shows your team first. Anyone else can switch to their own team and the site remembers it on their phone.

### How it works

There are three pieces:

- **The official FPL Draft site.** It's where all the real data lives. We only ever read from it, never change anything.
- **A small helper program on Cloudflare** (a "Worker"). When someone opens our site, the helper fetches the data from FPL, keeps a copy for a short time so we don't pester FPL, and hands it to the site. Trades and waivers are checked every couple of minutes, every day of the week. Finished gameweeks never change, so those are saved once and kept for good.
- **The website itself.** It's what your friends see. It runs on the same Cloudflare account and costs nothing at this size.

### What happens if something breaks

- **If FPL is down or changes something,** the site keeps showing the last good data with a note saying when it was last updated, rather than a blank page.
- **Every change I make gets tested automatically** before it can go live. If the tests fail, the change is blocked and the live site stays as it was. This matters more because I publish changes without waiting for you (your call, 2026-09-30).

### What you'll need to do

This is kept to a minimum, and I'll walk you through each step with screenshots-level instructions:

1. **Once:** create a free Cloudflare account and connect it to your GitHub repo (about 10 minutes, one time).
2. **Nothing per change.** I publish changes myself once the automatic tests pass, and tell you what's new. If you don't like something, just tell me.
3. **Each August:** tell me the new league ID and I'll change the one setting.

You won't need to run any commands, install anything or edit code.

### Cost

£0 a month. Cloudflare's free tier covers far more than 14 people use. If we ever outgrew it, the next step is about $5 a month, well inside your budget.

### Build order

Each step ends with something you can open and use:

| Step | You get |
|---|---|
| 1 | The site is live at a Cloudflare address, showing the league table. Proves the whole chain works. **Built, waiting on Cloudflare account.** |
| 2 | Trades and waivers: trade verdicts, trade ledger, waiver battles, player journeys. **Built.** |
| 3 | Draft: steals and busts, draft-only table, squad origins, hindsight redraft. |
| 4 | Results, form, luck, charts, streaks, records, head-to-head (the old site's features, rebuilt). |
| 5 | Live gameweek page. |
| 6 | Waiver suggestions. |

Once step 4 is done, the new site can replace the old one. Until then the old `index.html` and `data.json` stay exactly where they are, so if friends use a link to it, it keeps working.

### Analysis features (all chosen by the owner, 2026-09-30)

**Trades and waivers**
- **Trade verdicts:** who won each trade, from the points each side's players have scored for their new owner since (starters only).
- **Manager trade ledger:** each manager's net points from trading, and who they trade with most.
- **Waiver battles:** everyone who claimed the same player, who got them, and how it's worked out.
- **Player journeys:** every owner a player has had this season and what he scored for each.

**Draft**
- **Steals and busts:** every pick's points since the draft against where it was taken, plus a draft grade for each manager.
- **Draft-only table:** the league table if nobody had made a waiver or trade since the draft.
- **Squad origins:** how much of each squad, and its points, came from the draft, waivers or trades.
- **Hindsight redraft:** the draft done again with what we know now.

---

## Part 2: Technical detail

### Stack

- Vite + React + TypeScript single-page app.
- One Cloudflare Worker with static assets: serves the built SPA and the `/api/*` routes from the same project and domain (no CORS). Note: this is the current Cloudflare recommendation over Pages + Functions. Address becomes `<name>.workers.dev` rather than `.pages.dev`. Same cost and free tier.
- Workers KV for a "last good response" copy of each upstream call.
- GitHub Actions: typecheck, lint, unit tests on every PR. Cloudflare's GitHub integration builds a preview URL per PR and deploys `main` on merge.
- Owner decision 2026-09-30: Claude merges its own PRs once CI is green; no owner review step. Keep CI strict (typecheck, tests, build) since it's the only gate. Tell the owner in plain English what changed after each merge.

### Config

`LEAGUE_ID=634`, `DEFAULT_ENTRY_ID=1412` as Worker environment variables (set in `wrangler` config). Changed once a season.

### Worker routes and caching

Worker fetches from `https://draft.premierleague.com/api/`, caches in memory per isolate (the Cache API does nothing on `workers.dev`) and writes a last-good copy to KV (throttled to stay within KV free write limits).

| Our route | Upstream | Cache |
|---|---|---|
| `/api/config` | none (Worker settings) | 5 min |
| `/api/game` | `game` | 1 min |
| `/api/league` | `league/{LEAGUE_ID}/details` | 2 min |
| `/api/trades` | `draft/league/{LEAGUE_ID}/trades` | 2 min, all week |
| `/api/transactions` | `draft/league/{LEAGUE_ID}/transactions` | 2 min, all week |
| `/api/ownership` | `league/{LEAGUE_ID}/element-status` | 2 min |
| `/api/draft` | `draft/{LEAGUE_ID}/choices` (trimmed to picks) | 6 h |
| `/api/players` | `bootstrap-static` (trimmed from ~1 MB to the fields we use) | 1 h |
| `/api/gw/{n}` | `event/{n}/live` + `entry/{id}/event/{n}` for all 14 managers, built into points + fielded XIs | finished GWs kept for good (memory + KV); current GW 2 min |

Live-match-aware timings come with the live gameweek page (step 5).

"Match live" = current event started and not `data_checked`, and a fixture kicked off in the last ~2.5 h. Worth checking: the exact live flags in `bootstrap-static.events` and `fixtures`.

If upstream fails or returns something that doesn't parse, serve the KV copy with a `stale: true` flag and `fetchedAt`; the UI shows "last updated X ago". `/api/status` reports last successful fetch per route for debugging.

Endpoints marked "to verify" in `docs/fpl-draft-api.md` get checked (by the owner opening them in a browser) before the step that needs them.

### Trade and draft analysis data

Trades and waivers happen all week (owner, 2026-09-30), so `transactions` and `trades` refresh every 2 minutes regardless of match state. Cheap: two small requests, shared by everyone via the cache.

Analysis needs "what did each player score for each owner, and were they starting". Built from:

- Per-GW player points: `event/{gw}/live`.
- Per-GW squads: `entry/{entry_id}/event/{gw}` for each of the 14 entries.
- Ownership timeline: draft picks + transactions (`kind` `w` waiver / `f` free agent, `result` `a` accepted, `di`/`do` denied) + trades.

Finished, finalised gameweeks never change, so each is fetched once and stored in KV for good (about 15 upstream calls per GW, once). Only the current GW is refetched. Checked in the 2025/26 data: public trades all have `state: "p"` (processed), so pending offers are not visible. Denied waiver claims are visible, which allows "waiver battles" (who else wanted a player).

### How the analysis counts points (as built)

Full write-up with worked examples: `docs/trade-scoring.md`.


- A player earns for a manager only in gameweeks that manager owned him and he was in the XI that counted (after auto-subs). Verified: rebuilding every H2H score from squads matches all 70 GW1-5 scores.
- **Trade verdict:** each received player's points for the manager, plus (if traded on) an equal share of what came back, following the chain; dropping ends it. Shows raw "on paper" points too. Pending until a gameweek has been played.
- **Trade ledger:** gained = points from everyone traded in; given = points scored for new owners by players traded away, *excluding* players the manager had themselves got by trade. Without that, passing a player straight on counts against you twice (it took Daire from -143 to -45 after GW5).
- **Waiver battles:** waiver claims (`kind` `w`) grouped by gameweek and player where 2+ managers claimed; one line per manager (their best claim).
- **Journeys:** stints from squads, with how each started (draft pick by overall `index`, waiver, free agent, trade), plus "passed through" managers who held him only between gameweeks via trades.

### Live H2H scoring

Per entry for the current GW:

1. Squad from `entry/{entry_id}/event/{gw}` picks: positions 1-11 start, 12-15 bench in order. No captains in Draft (`captains_disabled`).
2. Per player points from `event/{gw}/live` `total_points`.
3. **Provisional bonus:** until a fixture's official bonus is in, give 3/2/1 to the top BPS in that fixture (ties share, FPL rules) and add to that player's points. Drop it once `bonus` is set.
4. **Auto-subs:** a starter with 0 minutes whose fixtures are all finished (or who has none) is replaced by the first bench player who played, as long as the formation stays valid against `settings.squad` `min_play_*`. GK only swaps with the bench GK.
5. Match score = sum of the resulting XI. Standings are recalculated live from all `matches` with this GW's live scores substituted in.

This is the fiddliest logic, so it gets thorough unit tests using saved real responses in `fixtures/`.

### Known API quirks (see `docs/fpl-draft-api.md`)

- `league_entries[].id` (matches/standings) is not `entry_id` (transactions, picks, entry endpoints). 10 of 14 differ. Always map via `league_entries`.
- Don't trust `standings[].matches_played` or `matches[].winning_league_entry`. Derive from points and `finished`.
- League IDs change every season.

### Frontend pages

- `/` Live gameweek: 7 matchups, expandable to both XIs with live points, bonus, subs.
- `/table` Standings plus live projected table during a GW.
- `/stats` Form, luck, points for/against, streaks, records, GW charts, H2H matrix.
- `/moves` Waivers and trades, per-player ownership history.
- `/draft` Recap (step 5).
- "My team" picker stored in `localStorage` (defaults to `DEFAULT_ENTRY_ID`).
- Mobile first. Most people will open it from WhatsApp on a phone.

### Repo layout (planned)

```
app/            React app (Vite root, because the old site owns the root index.html)
worker/         Cloudflare Worker (API routes, caching)
shared/         Types and scoring logic used by both, unit tested
fixtures/       Saved real API responses for tests
docs/
index.html, data.json   Old site, left in place until the new site replaces it
```

### Testing

- Vitest unit tests for `shared/` (standings, form, luck, auto-subs, bonus) against fixtures.
- Worker tests against mocked upstream responses, including failure and stale paths.
- CI must pass before merge.
