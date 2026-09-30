# Live scoring

Written 2026-09-30. Code: `shared/live.ts`. Tests: `shared/live.test.ts`. Page: `app/src/LivePage.tsx` (the Live tab). Worker route: `/api/live/:gw`.

## What the Live tab shows

Three views, chosen with the chips at the top (`#/live/matches`, `#/live/bonus`, `#/live/fixtures`).

**Matches** (the default), modelled on draftfpl.live's live page:

- The current gameweek's H2H matches, yours first and opened. The card header shows each manager's league position (as it stands with live scores), W-D-L record, the score with a W/L/D chip (outlined while the gameweek can still change, solid once it's over), and a dot for each counting player: ● played, red ● playing now, ○ still to play.
- Tap a match for both lineups. Every player row has his club shirt, name, a stat line (`90 MP, 1 GS, 1 GC, 3 B, 10 DC`: minutes, goals, assists, clean sheets, goals conceded for keepers and defenders, saves, penalties, own goals, bonus, defensive contributions, cards), his own club's match (`NEW 2 - 1 HUL | FT`, `67'`, or kick-off time) and his points. `B*` is provisional bonus.
- Lineups sit side by side as one table (row n on each side lines up), in the order the manager set them. After a gameweek FPL writes its auto-subs into the lineup and re-sorts it; `lineupAsPicked` puts it back. A starter who was subbed off stays in his spot, crossed out, with "0 mins, replaced by X". The bench stays in bench order (GK, 1, 2, 3) and the sub who came on reads "Came on for X" and isn't greyed. While the subs are only projected the notes read "Will come on for X" and "Didn't play, X will come on".
- Shirts load through the Worker (`/api/shirt/{code}`) because some phones block FPL's image host.
- Tap a player for where his points came from (`Minutes +2`, `Goals ×1 +6`, `Bonus (provisional) +3`, total).
- Bench points are totalled under each lineup.
- "Table if it ended now" while games are on, then "Stars and regrets": the best scores in counting XIs, and the best scores left on benches.
- Once the gameweek is over, the next gameweek's pairings and first kick-off.

**Bonus:** every started match's BPS leaders with the bonus they'd get (gold 3, grey 2, orange 1), the league owner of each player and whether he's on their bench, and whether FPL has confirmed the bonus yet.

**Fixtures:** every Premier League match with its score and status, and the goals, assists, own goals, penalties and cards with who did them and their league owner.

Everything refreshes every minute while games are on.

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

### Data behind the views

`/api/live/:gw` sends, for each player who did anything: minutes, points, bonus, BPS, whether he started, the non-zero stats, and FPL's points breakdown (`explain`, merged across a double gameweek). For each match: score, status, kick-off, everyone's BPS, and the events (goals, assists, cards and so on, with home/away). Shirts are FPL's own images, loaded by the visitor's browser; if one fails to load, a club badge is shown instead.

Checked on every gameweek so far: each player's breakdown adds up exactly to his points, and bonus worked out from BPS matches FPL's confirmed bonus.

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
