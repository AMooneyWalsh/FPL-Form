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
- See `docs/architecture.md` (plan, pending owner review), `docs/existing-app.md` and `docs/fpl-draft-api.md`.

## Working style

- **The owner is not technical and relies entirely on Claude.** Explain in plain English, never ask them to run commands or edit code, and give click-by-click steps for anything they must do (Cloudflare, GitHub). Prefer designs that run and recover by themselves.

- Present options and trade-offs (stack, hosting, database) with a recommendation before building. Don't pick silently.
- No code until scope has been agreed with the owner.
- Develop on the branch named in the session instructions. Don't open PRs unless asked.

## Notes for writing to the owner

Keep the tone plain and human. Avoid em dashes and stock AI phrasing.
