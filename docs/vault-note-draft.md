# Draft for vault note `01-Projects/Draft FPL.md`

Paste into the vault. The frontmatter below is a placeholder. I couldn't read an existing note in `01-Projects/` from the cloud session, so match it to your real notes before using.

---
```
---
type: project
status: planning
created: 2026-09-30
tags: [project, fpl, coding]
repo: https://github.com/amooneywalsh/fpl-form
---
```

# Draft FPL

## Goal
A draft Fantasy Premier League website for friends, similar to draftfpl.live.

## Decisions
- 2026-09-30: Nobody gets a "my team" until they pick one on their device (was defaulting to Adam's team for everyone).
- 2026-09-30: Repo is `fpl-form`. Planning lives here in the vault, technical docs live in the repo under `docs/`.
- 2026-09-30: Build a **companion site** to the official FPL Draft, not our own draft game.
- 2026-09-30: Scope is **one league, the friends group** (14 managers in 2026/27, up from 12).
- 2026-09-30: Must-haves: live H2H scores, standings/form/stats, waiver and trade tools. Discord bot was a nice-to-have (later dropped, see below).
- 2026-09-30: Maintenance appetite is light, weekly.
- 2026-09-30: Hosting is **static site plus Cloudflare Worker** (caches FPL data, enables live scores, no manual data commits).
- 2026-09-30: Budget up to 5 to 10 a month.
- 2026-09-30: **Rebuild cleanly** rather than extending `index.html`. Reuse the data logic and ideas from the old version.
- 2026-09-30: Stack is **Vite + React + TypeScript**, deployed on Cloudflare Pages with the Worker in the same repo.
- 2026-09-30: Site is **public by link**, no logins. "My team" can be remembered per browser.
- 2026-09-30: Use the **free Cloudflare Pages address** for now. Buy a domain later if the group uses it.
- 2026-09-30: 2026/27 league ID is **634**, Adam's entry ID is **1412** (default "my team"). Both are settings, updated each season.
- 2026-09-30: Adam isn't technical and relies on Claude for all of the build and upkeep. Site must run and recover by itself; Adam's jobs are clicks only.
- 2026-09-30: **Claude publishes changes without Adam's review** once automatic tests pass, then tells Adam what changed.
- 2026-09-30: **Focus on the differentiators vs draftfpl.live: trade analysis and draft analysis.** New build order: skeleton, trades/waivers, draft analysis, table/stats, live gameweek, waiver suggestions.
- 2026-09-30: Analysis features, all eight chosen: trade verdicts, manager trade ledger, waiver battles, player journeys; steals and busts, draft-only table, squad origins, hindsight redraft.
- 2026-09-30: **Trade cards follow the chain**: a player traded on is worth his points for you plus an equal share of what you got for him (dropping ends the chain). Cards also show an "on paper" raw-points number. The overall trade table never follows chains, so it never double counts. Came from Adam's Saka/Ndiaye/Bruno example. Details in repo `docs/trade-scoring.md`.
- 2026-09-30: **Same-gameweek swap-backs count as an undo.** If two managers trade players straight back in the same gameweek (and that's all the second trade does), those players are removed from the first trade and the second is ignored. Came from the Ross/Daire Saka-Szoboszlai veto on 26 Aug; real trade was Hill + Doku for Mitchell + Groß (Ross +54).
- 2026-09-30: Trades and waivers refresh every ~2 minutes, all week. Finished gameweeks are stored once and kept.
- 2026-09-30: Nice-to-have order: **draft recap first**, then waiver suggestions. Chat reminders are **dropped** because the group uses WhatsApp, which has no simple free bot route.

## Findings
- After GW5: best draft steal Groß (pick 142, Daire), worst bust Watkins (pick 11, Jack). If nobody had made a move, Daire would top the table; Adam has kept 13 of 15 picks and is top for real.
- Daire has made 18 of the league's 21 trades by GW6, often passing players straight on. The trade ledger was changed so that isn't double counted.
- draftfpl.live is a companion to the official FPL Draft game (live H2H scores, standings, stats, waiver tips, Discord bot, free plus Pro tier). It doesn't run drafts itself.
- Existing repo is already a read-only companion for league 6573 "Drafty In Here" (12 managers, H2H, waivers, trades): one `index.html` plus a hand-refreshed `data.json`.
- FPL Draft API is unofficial. Reads are open (verified 2026-09-30, no login), actions need a logged-in session.
- League IDs get reused each season: 6573 is now someone else's league. The league ID has to be a setting, updated each season.
- Some API fields are unreliable (`matches_played`, `winning_league_entry`), so the site calculates results itself.

## Open questions
- Is the old site live somewhere friends use (GitHub Pages)? Unanswered; old files stay put until the new site replaces them, so it's safe either way.

## Progress
- [x] Repo set up, CLAUDE.md, docs
- [x] Scope interview, round 1 (type, scale, must-haves, hosting, budget)
- [x] Stack decision
- [x] Verify FPL Draft API reads work without login
- [x] Get the 2026/27 league ID (634)
- [x] Confirm league 634 details: "Drafty In Here", 14 managers, H2H, waivers, trades on, 30s draft on 16 Aug
- [x] Architecture doc agreed (`docs/architecture.md`)
- [x] Save real API responses (network access to draft.premierleague.com allowed in the cloud environment, all endpoints verified)
- [x] Step 1 built: league table from live FPL data, my-team highlight, fallback when FPL is down, automatic checks
- [x] Adam: Cloudflare account created and repo connected. **Live at https://drafty-in-here.amooneywalsh.workers.dev** (2026-09-30)
- [x] Step 2 built: trade verdicts, trade ledger, waiver record and battles, player journeys (Trades is the landing page)
- [x] Step 2 live and checked against real data (2026-09-30)
- [ ] Optional: switch off Cloudflare's non-production branch builds (they fail instantly and aren't needed)
- [ ] Optional: set up KV storage so finished gameweeks survive restarts (needs a namespace id)
- [x] Step 3 built: Draft tab with draft grades, steals and busts, draft-only table (best XI each week), where the points come from, hindsight redraft
- [x] Step 4 built: League tab with table and position chart, form, fixture luck, head to head, records and streaks. Everything the old site did is now on the new one.
- [ ] Decide what to do with the old site (index.html + data.json at the repo root)
- [x] Step 5 built: Live tab (live H2H scores with provisional bonus and projected auto-subs, table if it ended now, next gameweek, PL fixtures)
- [x] Live tab v2 (1 Oct, from Adam's draftfpl.live screenshot): per-player stat lines, own-club match and status, shirts, sub markers, points breakdown on tap, match headers with league position, record, W/L chip and progress dots, bench points, Bonus view with league owners, Fixtures view with scorers/assists/cards, Stars and regrets
- [x] Full review (30 Sept): UX pass, regression tests on live data, 7 bugs and 7 UX fixes (see repo docs/review-2026-09-30.md). Biggest: friends no longer see Adam's team as theirs (first-visit team picker), and the site no longer gets stuck pre-season
- [x] Step 6: waiver suggestions (1 Oct), with injury flags, free agent signings, draft day and official fixture difficulty

## 30 Sept 2026: navigation
- Reviewed page layout and journeys (`docs/navigation-review.md`). Chose option A: four tabs (Live, League, Moves, Draft), player pop-up and manager page.
- Step 1 done: tabs cut to four, site opens on Live during games and League otherwise, section menus stay on screen, Draft split into sections.
- Step 2 done: tap any player or manager name for their own page. Manager page shows position, form, next opponent, trades, waivers, draft grade and squad. The manager filter now carries across pages.
- Manager page now has 'Season in numbers': luck (lucky wins, unlucky losses, rank), best/worst/average score, bench points, biggest win and defeat, streaks, players used, top scorers and points by source. Trades list trimmed to the latest three with a 'See all' link.
- Manager page stats now show where each number ranks in the league (e.g. 'Most in league', 'Joint 3rd highest'). Added a Transfers row: trades, trade net, waivers won, pickup points.
- Manager page ranks are coloured: green for the top third of the league, red for the bottom third, grey for middle or neutral stats (e.g. number of trades). Wording counts from the nearer end ('3rd best', '2nd worst').
- Step 6 done: waiver suggestions (Moves > Suggestions) using form, points a game, fixtures and fitness, with a drop suggestion from your squad. Injury flags next to every player name. Free agent signings list on Waivers. Draft day section (average pick time, slowest pick, auto picks).
- Fixture difficulty now uses FPL's official ratings from the main FPL game's API (the owner spotted the estimate was wrong). The old estimate only kicks in if that API is down.
- Trade network added to Moves > Trades (who trades with whom, dot size = trades, colour = up or down on trades, tap a manager to focus). Brought back from an earlier draft site.
