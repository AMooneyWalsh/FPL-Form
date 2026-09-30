# Live scoring

Written 2026-09-30. Code: `shared/live.ts`. Tests: `shared/live.test.ts`. Page: `app/src/LivePage.tsx` (the Live tab). Worker route: `/api/live/:gw`.

## What the page shows

- **The current gameweek's 7 H2H matches**, with your match first and opened. Tap any match to see both lineups: each player's points and status (✓ played, ● playing now, · still to play, ✕ didn't play or no game), provisional bonus (`+2b`), and auto-subs (↑ in, ↓ out).
- **Table if it ended now**, while games are on.
- **Next up**: once the gameweek is over, the next gameweek's pairings and first kick-off.
- **Premier League fixtures**: scores, minutes played, or kick-off times.

It refreshes every minute while games are on.

## How scores are worked out

A manager's score = the points of their counting XI.

1. **Points** come from FPL's live data (`event/{gw}/live`, `total_points`).
2. **Provisional bonus.** FPL only adds bonus to a player's points once it's confirmed, which happens some time after the final whistle. Until then, for every match that has started and whose bonus isn't confirmed, we award 3/2/1 from that match's BPS, both teams together, using FPL's tie rules:
   - two tied for first both get 3, and the next gets 1;
   - a tie for second: both get 2;
   - a tie for third: all get 1;
   - three tied for first all get 3.

   Checked against FPL's official bonus for every GW5 match.
3. **Auto-subs.**
   - After a gameweek is processed, FPL lists the subs it made, and we use those.
   - Before that, we project them the way FPL does. Going through the XI in order, a starter who won't play (all his games are over and he played 0 minutes, or he has no game) is replaced by the first bench player, in bench order, who has played and keeps the formation legal (1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD). A keeper only swaps with the bench keeper.
   - Checked on GW5: with FPL's subs hidden, the projection brings on exactly the players FPL brought on, and all 14 scores match.

### FPL data quirks found

- Once a gameweek is processed, FPL writes the subs *into* the lineup (the sub takes the starter's slot) and re-sorts the XI by position (GKP, DEF, MID, FWD), as well as listing them in `subs`. So the lineup you get afterwards is not the one the manager picked. Using both is harmless, because the swap is already applied.
- Because of that re-sort, the original order of the XI is lost. When two starters of the same position both didn't play and only one can be subbed, FPL uses the original order, which we can't see afterwards. It doesn't affect the score: both scored 0.
- Lineups for a gameweek (`entry/{id}/event/{gw}`) return 404 until its deadline passes. The Worker treats that as "no lineups yet", not as an error.
- A player's club comes from `bootstrap-static` (`teamId` on `/api/players`), and is used to find his fixtures, including blank and double gameweeks.

## Refresh rates (Worker)

| Situation | Cached for |
|---|---|
| Current gameweek, games still to finish | 1 minute |
| Current gameweek, all finished (FPL still confirming) | 10 minutes |
| Next or older gameweek | 1 hour |
