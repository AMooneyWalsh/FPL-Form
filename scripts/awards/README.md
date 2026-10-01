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
