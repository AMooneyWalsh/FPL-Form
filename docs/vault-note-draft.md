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
- 2026-09-30: Repo is `fpl-form`. Planning lives here in the vault, technical docs live in the repo under `docs/`.
- 2026-09-30: Build a **companion site** to the official FPL Draft, not our own draft game.
- 2026-09-30: Scope is **one league, the 12 friends**.
- 2026-09-30: Must-haves: live H2H scores, standings/form/stats, waiver and trade tools. Discord bot is a nice-to-have.
- 2026-09-30: Maintenance appetite is light, weekly.
- 2026-09-30: Hosting is **static site plus Cloudflare Worker** (caches FPL data, enables live scores, no manual data commits).
- 2026-09-30: Budget up to 5 to 10 a month.
- 2026-09-30: **Rebuild cleanly** rather than extending `index.html`. Reuse the data logic and ideas from the old version.
- 2026-09-30: Stack is **Vite + React + TypeScript**, deployed on Cloudflare Pages with the Worker in the same repo.
- 2026-09-30: Site is **public by link**, no logins. "My team" can be remembered per browser.

## Findings
- draftfpl.live is a companion to the official FPL Draft game (live H2H scores, standings, stats, waiver tips, Discord bot, free plus Pro tier). It doesn't run drafts itself.
- Existing repo is already a read-only companion for league 6573 "Drafty In Here" (12 managers, H2H, waivers, trades): one `index.html` plus a hand-refreshed `data.json`.
- FPL Draft API is unofficial. Reads look open, actions need a logged-in session.

## Open questions
- Custom domain?
- Nice-to-have ordering (Discord bot, waiver suggestions, draft recap).
- Does the FPL Draft API allow browser or Worker requests reliably? Verify from a normal machine.

## Progress
- [x] Repo set up, CLAUDE.md, docs
- [x] Scope interview, round 1 (type, scale, must-haves, hosting, budget)
- [x] Stack decision
- [ ] Verify FPL Draft API endpoints
