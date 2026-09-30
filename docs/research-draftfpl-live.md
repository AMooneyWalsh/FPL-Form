# Research: draftfpl.live

Limits: the site itself was blocked from the research sandbox, so this comes from search snippets only. Worth a manual look at the site.

## Key finding

draftfpl.live is a **companion tool for the official FPL Draft game**, not a draft engine. Users run their league on draft.premierleague.com (snake draft, waivers, trades, H2H all happen there) and the site reads that league's data and presents it better. It does not host its own drafts, waivers or trades.

## Features seen

- Live H2H fixtures: live scores, bonus points, autosubs, standings updates
- League standings and stats: points, form, draft vs waiver performance, team comparisons
- Player stats: points, form, PPG, minutes, goals, assists, clean sheets, saves, bonus, BPS
- Waiver suggestions
- Optional Discord bot: waiver reminders, kickoff reminders, gameweek recaps
- Free tier plus paid "Pro" tier

## How the official FPL Draft works (for reference)

- Snake draft before the season, with a pick timer (your league uses 30s)
- Squad of 15, each player owned by one manager only
- Waivers (your league) for moves, and trades between managers
- Head-to-head scoring, 3 pts win, 1 draw
- Live points come from the gameweek `live` endpoint

## So what does "build this" mean?

Two very different projects:

1. **Companion site** (what draftfpl.live is, and what the existing repo already is): read-only, pulls the official data, adds live scores and stats. Small, cheap, low maintenance.
2. **Full draft game** (own snake draft, waivers, trades, lineups, scoring): replaces the official game. Needs accounts, a realtime backend, a player and points feed, and real ongoing upkeep.

This is the first thing to settle with the owner.

## Decisions (2026-09-30)

Companion site, one league of 12, hosted as a static site plus Cloudflare Worker, light weekly maintenance, budget up to 5 to 10 a month, clean rebuild. See the vault note for the running list.
