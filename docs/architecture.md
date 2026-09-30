# Architecture (draft for review)

Status: draft, 2026-09-30. Nothing here is built yet.

---

## Part 1: The plain-English version

### What the site does

A website for Drafty In Here that shows:

1. **This gameweek, live.** All 7 head-to-head matches with scores updating during games, including bonus points and auto-subs, so you can see who's winning before FPL finalises it.
2. **The table and the stats.** Standings, form, luck, streaks, records, head-to-head history, like the old site but always up to date.
3. **Waivers and trades.** Who picked up whom, who's traded with whom, and how it's worked out.
4. **Later:** a draft recap, then waiver suggestions.

When you open it, it shows your team first. Anyone else can switch to their own team and the site remembers it on their phone.

### How it works

There are three pieces:

- **The official FPL Draft site.** It's where all the real data lives. We only ever read from it, never change anything.
- **A small helper program on Cloudflare** (a "Worker"). When someone opens our site, the helper fetches the data from FPL, keeps a copy for a short time so we don't pester FPL, and hands it to the site. It checks more often during matches (every minute) and hardly at all midweek.
- **The website itself.** It's what your friends see. It runs on the same Cloudflare account and costs nothing at this size.

### What happens if something breaks

- **If FPL is down or changes something,** the site keeps showing the last good data with a note saying when it was last updated, rather than a blank page.
- **Every change I make gets tested automatically** before it can go live. If the tests fail, the change is blocked and the live site stays as it was.

### What you'll need to do

This is kept to a minimum, and I'll walk you through each step with screenshots-level instructions:

1. **Once:** create a free Cloudflare account and connect it to your GitHub repo (about 10 minutes, one time).
2. **Each time I finish a piece of work:** I'll open a "pull request" on GitHub, which is a proposed change. You look at the preview link I send, and if you're happy, press the green **Merge** button. The site updates by itself a minute later.
3. **Each August:** tell me the new league ID and I'll change the one setting.

You won't need to run any commands, install anything or edit code.

### Cost

£0 a month. Cloudflare's free tier covers far more than 14 people use. If we ever outgrew it, the next step is about $5 a month, well inside your budget.

### Build order

Each step ends with something you can open and use:

| Step | You get |
|---|---|
| 1 | The site is live at a Cloudflare address, showing the league table. Proves the whole chain works. |
| 2 | Results, form, luck, charts, streaks, records, head-to-head (the old site's features, rebuilt). |
| 3 | The live gameweek page. |
| 4 | Waivers and trades. |
| 5 | Draft recap. |
| 6 | Waiver suggestions. |

Once step 2 is done, the new site can replace the old one.

### Questions for you

1. **Is the old site live somewhere right now** (e.g. a GitHub Pages link your friends use)? If so, I'll leave it running until the new one has everything it had.
2. **Are you happy with the "I open a pull request, you press Merge" routine?** The alternative is that I publish changes directly, which is quicker but means nobody looks before it goes live.

---

## Part 2: Technical detail

### Stack

- Vite + React + TypeScript single-page app.
- One Cloudflare Worker with static assets: serves the built SPA and the `/api/*` routes from the same project and domain (no CORS). Note: this is the current Cloudflare recommendation over Pages + Functions. Address becomes `<name>.workers.dev` rather than `.pages.dev`. Same cost and free tier.
- Workers KV for a "last good response" copy of each upstream call.
- GitHub Actions: typecheck, lint, unit tests on every PR. Cloudflare's GitHub integration builds a preview URL per PR and deploys `main` on merge.

### Config

`LEAGUE_ID=634`, `DEFAULT_ENTRY_ID=1412` as Worker environment variables (set in `wrangler` config). Changed once a season.

### Worker routes and caching

Worker fetches from `https://draft.premierleague.com/api/`, caches with the Cache API and writes a last-good copy to KV (throttled to stay within KV free write limits).

| Our route | Upstream | Cache (match live) | Cache (otherwise) |
|---|---|---|---|
| `/api/bootstrap` | `bootstrap-static` | 1 h | 6 h |
| `/api/league` | `league/{LEAGUE_ID}/details` | 1 min | 30 min |
| `/api/live/{gw}` | `event/{gw}/live` | 60 s | 1 h (6 h after GW finalised) |
| `/api/picks/{gw}` | `entry/{entry_id}/event/{gw}` for all 14 entries, merged | 5 min | 6 h |
| `/api/transactions` | `draft/league/{LEAGUE_ID}/transactions` | 15 min | 1 h |
| `/api/trades` | `draft/league/{LEAGUE_ID}/trades` | 15 min | 1 h |
| `/api/draft` | `draft/{LEAGUE_ID}/choices` (to verify) | 24 h | 24 h |
| `/api/status` | none | n/a | n/a |

"Match live" = current event started and not `data_checked`, and a fixture kicked off in the last ~2.5 h. Worth checking: the exact live flags in `bootstrap-static.events` and `fixtures`.

If upstream fails or returns something that doesn't parse, serve the KV copy with a `stale: true` flag and `fetchedAt`; the UI shows "last updated X ago". `/api/status` reports last successful fetch per route for debugging.

Endpoints marked "to verify" in `docs/fpl-draft-api.md` get checked (by the owner opening them in a browser) before the step that needs them.

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
src/            React app
worker/         Cloudflare Worker (API routes, caching)
shared/         Types and scoring logic used by both, unit tested
fixtures/       Saved real API responses for tests
legacy/         Old index.html + data.json, kept until the new site replaces it
docs/
```

### Testing

- Vitest unit tests for `shared/` (standings, form, luck, auto-subs, bonus) against fixtures.
- Worker tests against mocked upstream responses, including failure and stale paths.
- CI must pass before merge.
