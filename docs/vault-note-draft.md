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

## Findings
- draftfpl.live is a companion to the official FPL Draft game (live H2H scores, standings, stats, waiver tips, Discord bot, free plus Pro tier). It doesn't run drafts itself.
- Existing repo is already a read-only companion for league 6573 "Drafty In Here" (12 managers, H2H, waivers, trades): one `index.html` plus a hand-refreshed `data.json`.
- FPL Draft API is unofficial. Reads look open, actions need a logged-in session.

## Open questions
- Companion site or full draft game?
- Players, must-haves vs nice-to-haves, hosting, budget, maintenance appetite.

## Progress
- [x] Repo set up, CLAUDE.md, docs
- [ ] Scope interview
