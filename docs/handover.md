# Handover (1 Oct 2026)

Read `CLAUDE.md` first, then this. The owner is not technical: explain in plain English, never ask them to run commands, keep the tone human (no em dashes, no stock AI phrasing). Claude may merge its own PRs once the GitHub `check` job passes, then confirm on the live site.

## Where things stand

- Live site: https://drafty-in-here.amooneywalsh.workers.dev (Cloudflare Workers Builds deploys `main`).
- All six steps of the original plan are built. Page map: `docs/architecture.md` > "Frontend pages". Worker routes: same doc > "Worker routes and caching".

### Layout (PRs #13-#14, `docs/navigation-review.md`)

- Four tabs: Live, League, Moves, Draft. Each has a sticky chip menu (`SubNav` in `app/src/bits.tsx`) with its own link, e.g. `#/draft/redraft`.
- With no link, the site opens on Live while a gameweek is in progress, else League. Old links (`#/trades`, `#/waivers`, `#/players`, `#/table`) redirect.
- `PlayerName` links to `#/player/{id}` (`PlayerPage` in `PlayersPage.tsx`). `Manager` and league-table teams link to `#/manager/{id}` (`ManagerPage.tsx`). Both render `<a>`, so never put them inside a button.
- The "Show" filter uses `useShownManager` in `bits.tsx` (sessionStorage), so it carries across pages. The manager page's "See all trades" sets it.
- Back link steps back within the site only (it counts hashchanges), otherwise goes home.

### Manager page (PRs #15-#17)

- "Season in numbers" has four groups:
  - luck (lucky wins, unlucky losses)
  - scores (highest, lowest, average, bench points), biggest win and defeat, streaks
  - players used and owned, top scorers, points by source
  - transfers (trades, trade net, waivers won, pickup points)
- `allSummaries` builds every manager's summary once so each stat can be ranked.
- `rankOf` takes which way is good (`high` / `low` / `neutral`) and counts from the nearer end ("3rd best", "2nd worst", or custom words like most/fewest, luckiest/unluckiest). The top third is green, the bottom third red, and middle or neutral stats grey. The owner asked for this; keep it.
- Highest and lowest scores are labelled Highest/Lowest, so a lowest score reads "7th best" (a higher low is better).

### Waiver suggestions and API data (PRs #18-#19, `shared/waivers.ts`)

- `/api/players` now keeps form, injury status and news, chance of playing, points per game, minutes, starts, xG, xA and penalty order, plus the next ~3 GWs of fixtures. It's ~20% of raw bootstrap.
- `/api/ownership` is loaded as `data.owners` (who owns each player now; null = free agent).
- `/api/fdr` serves FPL's official fixture difficulty from the main game's API (`fantasy.premierleague.com/api/fixtures/?future=1`, same club ids). The Draft API has no difficulty ratings and its `ep_next` is always null.
  - I first shipped a home-made estimate and the owner rightly called it wrong. Always check the main FPL API before inventing a number.
  - `clubDifficulty` is now only a fallback, and the page says so when it's used.
- Suggestions rating: (0.6 × form + 0.4 × points per game) × fixture factor (±10% per difficulty step from 3, averaged over the next 3) × chance of playing.
  - Out / suspended / unavailable players and anyone with 0 minutes are excluded.
  - `weakestAt` picks the drop: anyone out first, then lowest form.
- `InjuryFlag` (bits.tsx) shows Out / Ban / 75% next to every player name, with the news as a tooltip.
- Waivers page: "Free agent signings" (`freeAgentSignings`), newest first, with points since, following the Show filter.
- Draft > Draft day (`draftDay`): average and slowest pick time (gap since the previous pick; pick 1 isn't timed) and auto picks (`was_auto`). This league had a 30-second pick timer; Ben had 8 auto picks.

### Trade network (Moves > Trades)

- `TradeNetwork.tsx`: managers on a circle, dot size = trades made, colour = trade net (green up, red down, grey level, faint = none), line thickness = trades between that pair (from `LedgerRow.partners`). Tap a dot to focus it and list their partners; otherwise shows the top five partnerships. The owner had this on an earlier draft site and asked for it back.

### Live tab (PRs #9-#11)

- Lineups are one two-column grid. Shirts load via `/api/shirt/{code}`. `lineupAsPicked` in `shared/live.ts` undoes FPL's post-gameweek rewrite. The subbed-off starter is crossed out, the bench is numbered GK/1/2/3, and notes read "Came on for X" (or "Will come on for X" while projected).
- Auto-sub rules (checked against FPL):
  - a starter is replaced only on 0 minutes, and the bench is tried in order
  - the formation must keep 1 GK, 3 DEF, 2 MID and 1 FWD
  - the sub keeper only replaces the keeper

  The owner pushed hard on this, so be careful here.

## Checks before merging

- `npm run check` (typecheck, 112 tests, build).
- `npx tsx scripts/regression.ts` after touching `shared/` (checks against live FPL data).
- UI: headless Chromium (`/opt/pw-browsers/chromium`, `playwright-core` in the scratchpad) at 390px. Use a small local Node server (under 30 lines) that:
  - serves `dist/`
  - proxies `/api/*` to the live Worker
  - answers any route you've changed (e.g. `/api/players`, `/api/fdr`) by calling the new `trimPlayers` / `trimFixtures` from `worker/index.ts` via `tsx`

  Set `localStorage.myTeamEntryId = "1412"` to view as the owner.
- The sandbox's browser proxy sometimes fails requests to the live site (`ERR_TOO_MANY_RETRIES`). Confirm live deploys with `curl` against the JS bundle and `/api/*` instead.
- Screenshots: use a new file name each time. Re-reading the same path can show a stale image.

## Open with the owner

1. Old site (root `index.html` + `data.json`): archive it into an `old-site/` folder or replace it with a redirect? No answer yet.
2. Optional max-3-per-club switch on the hindsight redraft (not an official Draft rule)?
3. Waiver suggestions are new. Ask whether the ratings and drop picks look sensible against the owner's own judgement.
4. Gameweek 6 (from Sat 10 Oct) is the Live tab's first real in-play run, especially the "Will come on for X" projections. Ask the owner for screenshots.
5. Ideas raised but not built: season xG over/under-performance from per-gameweek live stats, showing the current waiver order.

## Known limits

- KV storage isn't set up (harmless). Cloudflare PR preview builds fail for an unknown reason; ignore them.
- Vault note updates go in `docs/vault-note-draft.md`, because the cloud session can't reach the owner's Obsidian vault.
