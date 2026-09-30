# Handover (1 Oct 2026)

Read `CLAUDE.md` first, then this. The owner is not technical: explain in plain English, never ask them to run commands, keep the tone human (no em dashes, no stock AI phrasing). Claude may merge its own PRs once the GitHub `check` job passes, then confirm on the live site.

## Where things stand

- Live site: https://drafty-in-here.amooneywalsh.workers.dev (Cloudflare Workers Builds deploys `main`).
- Built and live: four tabs, Live / League / Moves / Draft (see `docs/navigation-review.md`). Moves holds Trades, Waivers and Player journeys. Every tab has a sticky chip menu (`SubNav` in `app/src/bits.tsx`) with its own link, e.g. `#/draft/redraft`. With no link the site opens on Live while a gameweek is in progress, else League. Old links (`#/trades`, `#/waivers`, `#/players`, `#/table`) redirect.
- Next up: navigation step 2 (player pop-up on any name, manager page, remembered manager filter). The owner approved it.
- Last work (PRs #9-#11): Live tab v2 and lineup fixes.
  - Lineups are one two-column grid so rows line up.
  - Shirts load via the Worker route `/api/shirt/{code}`, because FPL's image host failed on the owner's phone.
  - Lineups show the order the manager set. `lineupAsPicked` in `shared/live.ts` undoes FPL's post-gameweek rewrite. The starter who was subbed off is crossed out ("0 mins, replaced by X"), the bench is numbered GK/1/2/3, and the sub reads "Came on for X".
  - While subs are only projected, the notes read "Will come on for X".
- Auto-sub rules (checked against FPL): a starter is replaced only on 0 minutes, and the bench is tried in order. The formation must keep 1 GK, 3 DEF, 2 MID and 1 FWD, and the sub keeper only replaces the keeper. The owner pushed hard on this, so be careful here.

## Checks before merging

- `npm run check` (typecheck, 104 tests, build).
- `npx tsx scripts/regression.ts` after touching `shared/` (checks against live FPL data).
- For UI, take headless Chromium screenshots at 390px against a local stand-in server serving `fixtures/`. The old scratchpad copy won't carry over; rebuild it from `worker/index.ts` and `shared/live.ts`.

## Open with the owner

1. Old site (root `index.html` + `data.json`): archive it into an `old-site/` folder or replace it with a redirect? No answer yet.
2. Optional max-3-per-club switch on the hindsight redraft (not an official Draft rule)?
3. Step 6, waiver suggestions: the last item on the original plan. Start it?
4. Gameweek 6 (from Sat 10 Oct) is the Live tab's first real in-play run, especially the "Will come on for X" projections. Ask the owner for screenshots.

## Known limits

- KV storage isn't set up (harmless). Cloudflare PR preview builds fail for an unknown reason; ignore them.
- Vault note updates go in `docs/vault-note-draft.md`, because the cloud session can't reach the owner's Obsidian vault.
