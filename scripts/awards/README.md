# Gameweek awards graphic

A shareable image for the league WhatsApp: tongue-in-cheek "awards" built from real league numbers. The owner wanted it to read as a roundup that pokes fun at people, not an advert for the site. The site gets one line at the bottom.

1. Pull the numbers: `npx tsx scripts/awards/insights.mts` and `npx tsx scripts/awards/more.mts`. They read the live Worker API and run the same `shared/` maths as the site. Between them they cover:
   - trade ledger and biggest trade
   - luck, steals and busts, hindsight redraft
   - auto picks, waiver battles and claims, most travelled players
   - standings, highest and lowest scores, bench points, injuries
2. Copy `gw5-awards.html` and rewrite the cards. Use eight cards plus one wide "heist" card so the 2-column grid has no gap. Check every number against the script output.
3. Render: `node scripts/awards/render.mjs scripts/awards/gwN-awards.html gwN-awards.png` (1080x1350 at 2x). Check the grid doesn't run under the footer.
4. Send the PNG to the owner with `SendUserFile`. They post it themselves.

Include the owner (Adam) when there's something to tease, so it isn't him roasting everyone else.

## Gameweek preview

A matching "weekend ahead" graphic, posted before the deadline (first one: GW6).

1. `npx tsx scripts/awards/preview.mts [gw]` prints every head-to-head: table position, form, a rough win chance (half season average, half squad strength on paper), injuries, in-form players with fixtures, this week's signings and trades. It reads the live site's API.
2. Squad turnover since last week is a good angle: compare `/api/gw/{last}` squads with `/api/ownership`.
3. Copy `gw6-preview.html` (1080x1480; render with height 1480): one wide card for the week's main story, one card per match with league position and last-three form chips (from `preview.mts`), the win-chance bar, plus one extra card so the grid has no gap. Render with `render.mjs` as above.

## Writing the cards (owner feedback, 9 Oct)

Every card names two or more managers, so "he" and "his" get confusing fast. Use names instead of pronouns, give each sentence one idea, and don't string clauses together with "and" or "which" when it's unclear who they refer to. Short sentences fit the cards better anyway.

Each match card should contrast the two managers: how they play the game (trades, waiver claims, how much of their draft they've kept), their season so far (position against points scored, luck, steady or streaky scores), and any shared opponents or past meetings. The owner's favourite GW6 card was Ben v Darragh: one sharp fact, then the other manager in four words. `scripts/awards/preview.mts` has most of the numbers. For the rest, use `tradeLedger`, `waiverRecord`, `fixtureLuck` and `draftGrades` from `shared/`, as `insights.mts` does.
