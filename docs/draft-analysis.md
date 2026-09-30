# Draft analysis

Written 2026-09-30, after GW5. Code: `shared/draft.ts`. Tests: `shared/draft.test.ts`. Page: `app/src/DraftPage.tsx` (the Draft tab).

All of it uses each player's FPL points from the gameweeks played so far, so early in the season it can swing a lot from week to week.

## Draft grades

For each manager's 15 picks:

- **Pts:** the picks' total FPL points this season, **whoever owns them now**. This judges the picks, not what the manager did with them afterwards.
- **Vs slot:** every pick gets a value = its pick number minus where its points rank among all 210 drafted players. For example, Groß went 142nd but ranks 1st, so he's worth +141. The column shows each manager's average per pick. Across the league the values add up to exactly zero, so positive means you drafted better than your slots suggested.
- **Kept:** how many picks are still in their squad.
- **Best pick:** their highest-value pick.

## Steals and busts

The 5 highest and 5 lowest pick values in the league (or just yours, with "Just mine"). Auto-picks are marked, because the manager didn't choose them.

## If nobody had made a move (draft-only table)

The H2H table if every manager had kept their 15 draft picks all season and played the same fixtures.

- Nobody picked these teams week to week, so **each team fields its best possible legal XI every gameweek**: 1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD, 11 players, using the league's own squad rules from FPL. That makes the scores higher than real ones, but every manager gets the same treatment.
- The "Real" column shows their actual position. ▲ means they're higher in real life, so their moves since the draft have helped.
- Real teams can score more than draft-only teams, because draft-only teams can't add anyone. Draft-only teams can score more than real teams, because they always pick the perfect XI.

## Where the points come from (squad origins)

Each manager's points that counted this season (their XI, after auto-subs), split by how they got the player who scored them: draft, waivers, free agents or trades. How each player was acquired comes from player journeys (`playerJourney` in `shared/moves.ts`), using the trade list after same-gameweek swap-backs are cancelled.

Check: for every manager, the four origins add up exactly to their real points-for total. The counts under each bar are how many of their current 15 came each way.

Chart colours are the dataviz reference categorical slots 1-4, validated for colour-blind separation in light and dark mode. Two light-mode colours are under 3:1 contrast, so every bar also shows its numbers as text.

## Hindsight redraft

The draft is run again in the same snake order. Each manager takes the **highest-scoring player still available who fits their squad** (2 GKP, 5 DEF, 5 MID, 3 FWD). **Every player in the game** counts, including ones nobody drafted. Ties go to FPL's pre-season draft rank.

It shows who each manager actually took with each pick against who they "should" have taken. The first two rounds are shown, with a button for more, and "Just mine" shows all 15 of your picks.

## Data notes

- Overall pick number is `choices[].index`, not `pick` (see `docs/fpl-draft-api.md`).
- Squad rules come from `bootstrap-static.settings.squad`. The Worker trims it into `rules` on `/api/players`, which now returns `{ players, rules }`.
