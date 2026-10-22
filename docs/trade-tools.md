# Trade tools (Moves > Trade checker, Trade partners)

Written 22 Oct 2026. Code: `shared/trading.ts` (tests in `shared/trading.test.ts`), `playerRating` in `shared/waivers.ts`, pages `app/src/TradeCheckerPage.tsx` and `app/src/TradePartnersPage.tsx`.

## The rating

One number per player, the same everywhere (waiver suggestions, checker, partners): `playerRating(p, fixtures, difficulty)`.

> (0.6 × form + 0.4 × points per game) × fixture factor × chance of playing

- Fixture factor: ±10% per difficulty step away from 3, averaged over the next 3 fixtures (FPL's official difficulty, falling back to `clubDifficulty`).
- Chance of playing from FPL; anyone out (injured, banned, gone) rates 0.
- Rounded to one decimal. It's roughly the points he'd score in a game, so an XI's total is roughly a week's score.

Moving the formula into `playerRating` left the waiver suggestions identical (checked against live data with three fixture sources).

## Best XI

The highest-rated XI within `rules.minPlay`/`maxPlay` (1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD, 11 in all). Each position's starters are always its best players, so `bestXI` just tries every legal formation (8 of them) and keeps the highest total. A test checks it against all 1,365 ways of picking 11 from 15.

A trade's worth to a manager is the change in their best XI. So swapping a bench player can lose rating overall and still improve the XI.

## Like for like

FPL Draft trades must swap the same number of each position (FPL's own guide: "Trades can involve multiple positions but must be like for like"), so squads keep 2-5-5-3. All 26 trades in league 634 so far match. The checker refuses to give an XI verdict for anything else and says why.

## Strength by position

Average rating of each squad's best 1 GK, 4 DEF, 4 MID, 2 FWD (the 2-5-5-3 squad scaled to 11, `typicalShape`), ranked 1-14. Comparing a fixed number per position is fairer than comparing whoever starts: a squad that starts 3 weak-ish defenders isn't better at the back than one that starts 5 good ones. Top third green, bottom third red, as on the manager page. "On the bench" lists the 4 not in the best XI.

## Partners and swaps

- `bestSwap` tries every like-for-like 1-for-1 and 2-for-2 between two squads (about 1,500), leaving out injured players (they rate 0, so they'd look like free throw-ins). The whole league takes about 25 ms on a laptop.
- `compareSwaps`: swaps that improve both XIs (by at least 0.1) beat the rest. Among those, the fairest wins (largest smaller gain, then largest total), because that's the one the other manager is likeliest to accept. Otherwise, the one costing them least, then helping you most. Fewer players breaks ties.
- `tradePartners` takes each manager's best swap, sorts by the same rule and keeps 5. The "why" line names the position where each is most ahead of the viewer by league rank, and the other way round.

## Links

`#/moves/checker?from=&with=&give=&get=` (ids comma separated). `from` is the sending side, so a link sent to the other manager opens turned round, from their side. Players no longer owned by that side are dropped.
