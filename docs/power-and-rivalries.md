# Power rankings, waiver order and rivalry pages

Written 21 Oct 2026, after GW7. Backlog items 3, 5 and 10 (`docs/build-plan-2026-10.md`, Group B).

## Power rankings (League > Power, `#/league/power`)

Code: `shared/power.ts` (`powerRankings`, `powerAt`), tests in `shared/power.test.ts`. Page: `app/src/PowerView.tsx`.

A ranking that's a better guide to who's strong right now than the H2H table. Four ingredients:

| Ingredient | What it is | Weight |
|---|---|---|
| Last 4 | Average score over the last 4 finished gameweeks | 35% |
| Avg | Average score all season | 25% |
| All-play | Every week, their score against all 13 others (won-drawn-lost). Takes fixture luck out. A draw counts half. | 20% |
| Squad | The best legal XI from the squad they have **now** (`data.owners`), scored in each of the last 4 gameweeks, whoever owned those players then, averaged. So a trade or signing counts straight away. Uses `bestXIScore` from `shared/draft.ts`, which respects the formation minimums and maximums from `data.rules`. | 20% |

Each ingredient becomes a z-score (how many standard deviations from the league average), so no one number drowns out the others. Power = the weighted sum. Rank by power, highest first.

- **Arrows** compare with the same ranking worked out as at the previous gameweek, with each manager's squad from that gameweek (`data.seasons`).
- **Table** column: their place in the H2H table, so the page can say "the table is hardest on Darragh (9th there, 1st here)".
- Only finished gameweeks count. While a gameweek is being played the ranking stays as at the last finished one, but the squad column already uses today's squads.

Checked on live data after GW7: Adam (top of the table, best season average and all-play) is 2nd behind Darragh (9th in the table, but the strongest squad by some way and good recent scores). Season average and all-play are 95% correlated, as you'd expect, but together they're 45% of the score, so the starting weights were kept.

## Waiver order (top of Moves > Waivers, and the manager page)

Straight from FPL: `league_entries[].waiver_pick` in `/api/league` (1 = first in line).

**The rule, as checked:** `waiver_pick` is the reverse of the H2H league table (league points, then points scored), after the last finished gameweek. It matched exactly, all 14 places, in two snapshots: `fixtures/league-634-details.json` (after GW5) and the live league after GW7 (21 Oct). The waiver battles in GW2-7 mostly fit it too: where a lower-placed manager beat a higher one to a player, the higher one had nearly always ranked that claim lower on their own list.

Not confirmed: how FPL ordered the first week (before there was a table). It looks like reverse draft order, but the data doesn't settle it, so the page doesn't say.

The page shows FPL's numbers rather than working the order out, with the next waiver deadline (`nextDeadline` in `shared/deadlines.ts`). If the gameweek before those waivers hasn't finished yet, the hint says the order will be reshuffled first.

## Rivalry pages (League > Head to head, `#/league/h2h?a=<entryId>&b=<entryId>`)

Code: `shared/rivalry.ts` (`rivalryContext` once for the league, then `rivalry(ctx, a, b)` per pair), tests in `shared/rivalry.test.ts`. Page: `app/src/RivalryView.tsx`.

- The pair is in the link (`hashParams` / `replaceHashParams`), so copying the address shares it. With no pair in the link it defaults to you v your next opponent.
- **Head to head:** the real record and every meeting (as before), plus "If they'd played every week": how many gameweeks each outscored the other.
- **Tale of the tape:** position, league points, points scored, average, highest score, luck, trade net, pick-up points and draft grade, side by side. The better one on each line gets the "good" tint. Luck counts higher as better, as on the manager page.
- **Trades between them:** who's ahead across them (the sum of the verdict margins from `tradeVerdicts`, so it follows chains as the cards do; trades too early to call are left out), then the folded trade cards.
- **Waiver battles:** players both claimed, and who got each.
- **Played for both:** any player who's been in both squads in a gameweek, with the points he scored in each one's starting XI and who had him first.
- The manager page links to it: "You v Ben" when you've picked your team, otherwise that manager v their next opponent. It also shows the manager's waiver priority.
