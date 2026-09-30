# Draft FPL (FPL-Form)

A website for a group of friends who play Fantasy Premier League Draft. Planning for this project lives in the owner's Obsidian vault, not here.

## Where things live

- **Planning, decisions, open questions, progress:** vault note `01-Projects/Draft FPL.md` in the owner's Obsidian vault ("Second Brain", on their Mac, inside iCloud).
  - Read it before asking the owner something that might already be answered.
  - Update it after every significant decision (stack, hosting, scope, scoring rules, etc.).
  - Do NOT follow the vault's own CLAUDE.md routing rules. They are for note management, not this project.
  - If the vault isn't reachable (e.g. a cloud session), say so and put the update text in `docs/vault-note-draft.md` for the owner to paste in.
- **Technical docs** (setup, architecture, API notes): in this repo under `docs/`.

## Current state

- Existing app: a static, read-only stats viewer. `index.html` (single file, ~4.4k lines, vanilla JS) loads `data.json` and renders results/form tables, luck, charts, streaks, records, H2H, waiver and trade analysis, and player search for one league ("Drafty In Here", league id 6573, 12 managers, 2025/26).
- `data.json` is a snapshot of the official FPL Draft API, refreshed by manual "Update League Data" commits. There is no build step, backend, or CI.
- Live league for 2026/27: league ID `634` ("Drafty In Here", 14 managers, H2H, waivers, trades on), owner's entry ID `1412`. The old data.json league (6573) is last season's and that ID has since been reused by another league.
- New site (steps 1-5 built; tabs: Live, League, Moves, Draft): `app/` React, `worker/` Cloudflare Worker, `shared/` league maths, `fixtures/` real API data. Run `npm run check` before every merge, and `npx tsx scripts/regression.ts` (checks every calculation against live FPL data) after anything touching `shared/`. See `docs/setup.md`.
- **New session? Read `docs/handover.md` first.**
- See `docs/architecture.md` (agreed plan), `docs/existing-app.md` and `docs/fpl-draft-api.md`.

- **Live site:** https://drafty-in-here.amooneywalsh.workers.dev (Cloudflare Workers Builds deploys `main` automatically). Cloudflare's PR preview builds fail instantly for a setup reason we can't see; the GitHub `check` job is the real gate.

## Working style

- **The owner is not technical and relies entirely on Claude.** Explain in plain English, never ask them to run commands or edit code, and give click-by-click steps for anything they must do (Cloudflare, GitHub). Prefer designs that run and recover by themselves.

- Present options and trade-offs (stack, hosting, database) with a recommendation before building. Don't pick silently.
- Develop on the branch named in the session instructions. The owner has said Claude can merge its own changes without their review, once CI passes. Tell them in plain English what changed.
- Focus is trade and draft analysis (the differentiators vs draftfpl.live). Trades happen all week, so that data must stay fresh all the time.
- Leave the old root `index.html` and `data.json` in place until the new site replaces them. It may be live on GitHub Pages.

## Notes for writing to the owner

Keep the tone plain and human. Avoid em dashes and stock AI phrasing.
