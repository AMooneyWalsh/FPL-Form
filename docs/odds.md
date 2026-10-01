# Season odds (League > Odds, `shared/odds.ts`)

Plays the rest of the season 10,000 times in the browser and counts finishes.

- **Weekly score per manager:** a normal curve around their expected score.
  - Expected score = their real average, pulled towards the league average as if they had 6 extra average weeks, blended with squad strength.
  - Squad strength (`squadStrength`): best valid XI from their current squad on points per game, scaled by chance of playing, injured/suspended = 0. Its weight is 8/(played+8), never below 30%.
  - Spread = the league-wide standard deviation of weekly scores.
  - Each run also nudges every manager's level by a random amount (uncertainty from few results, plus 3 pts/week of drift for trades and injuries). Without this one manager was 63% for the title after GW5, far too sure.
- **Table:** 3 for a win, 1 for a draw, ties on points scored, then a coin toss.
- **Forfeits** (2026/27): places 1-3 and 11-14; lowest total points (selfies); the two *different* managers with the lowest single-gameweek scores of the season (cooking).
- **Immunity:** whoever is 1st in the main-game league `CLASSIC_LEAGUE_ID` (2757, "David Luiz Fan Club") via `/api/classic`, matched by full name.
- An in-progress gameweek is simulated from scratch (live points are ignored).
- Seeded, so the same data gives the same numbers.
