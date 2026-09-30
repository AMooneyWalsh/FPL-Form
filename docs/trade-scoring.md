# How trades are scored

Written 2026-09-30, after GW5. Code: `shared/moves.ts` (`Seasons.spell`, `tradeVerdicts`, `tradeLedger`, `passedThrough`). Tests: `shared/moves.test.ts`.

There are two different scores, and they answer different questions:

1. **Trade verdict** (one card per trade): *who has got more out of this particular trade so far?*
2. **Trade ledger** (the "Who's winning at trading" table): *overall, has trading helped this manager?*

Both are built on one basic rule.

## The basic rule: a player's "spell"

A player only earns points for a manager:

- from the gameweek the move takes effect,
- in gameweeks that manager owns him,
- and only when he's in the XI that counted, after auto-subs. Bench points don't count, but they're tracked separately.

**The spell ends the first gameweek he isn't owned by that manager**, whether he was traded on, dropped for a waiver, or anything else. After that, his points belong to whoever has him next.

This is reliable because it doesn't rely on piecing together the chain of trades. FPL publishes every manager's full squad for every gameweek, and the site reads ownership straight from those. As a check, adding up the XIs this way reproduces all 70 H2H scores from GW1-5 exactly.

## 1. Trade verdict

For each trade:

- Each side's total = the sum of the spells of the players they received, starting at the trade's gameweek.
- Whoever's total is higher is "winning", by the difference.
- If no gameweek has been played since the trade, it shows "Too early to call".

### What happens when a player is traded on

**The clock stops.** The first trade only gets credit for what the player did while he stayed with that manager. His later points count towards the *next* trade instead.

Real example, Kerkez:

| When | What happened | Kerkez's points counted for |
|---|---|---|
| Draft | Darragh drafts Kerkez | (not a trade) |
| GW2 trade | Darragh sends Kerkez + Ndiaye to Daire for Ballard + Doku | Daire, GW2-3: **6** |
| GW4 trade | Daire sends Kerkez, L.Miley and Bruno G. to Mark | Mark, GW4-5: **7** |

So the GW2 trade card shows Kerkez at 6 for Daire (with "gone after 2 GW"), and the GW4 card shows him at 7 for Mark. No point is ever counted in two trade verdicts for the same side.

### The weak spot: players passed straight on

Some players change hands twice before playing a single gameweek for the middle manager. Real example, on 26 August in GW2:

1. **08:03** Daire gets Hill, Saka and Doku from Ross, for Mitchell, Szoboszlai and Groß.
2. **18:29** Daire sends Saka straight back to Ross, and gets Szoboszlai back.

Saka never plays for Daire, so under the basic rule he's worth **0** in trade 1. That trade's card currently reads Ross 68, Daire 0, which makes it look like a disaster for Daire. But half of what Daire "lost" he undid the same evening. The value he got from Saka shows up on the *second* card (Szoboszlai, 4) rather than the first.

The card marks those players "moved on before playing", but it doesn't say what they turned into. That's the part that's hard to follow at the moment.

## 2. Trade ledger

Per manager, across all their trades:

- **Gained** = the spells of everyone they've received in trades, for them.
- **Given** = the spells of players they gave away, for the new owner. **Players they had themselves got in a trade are left out.**
- **Net** = gained - given.

### Why leave those players out

Without that rule, passing a player on gets charged twice. Take a simple chain where A trades X to B for S, then trades S to C for Y:

- A's real story is "I turned X into Y".
- If both trades charged A for what they gave away, A would be charged for X *and* for S's points with C. But S was only ever a stepping stone.
- With the rule, A is charged for X only (X was theirs to start with), and credited for S (while A had him) plus Y. So the net is roughly "Y (and any S) minus X", which is what actually happened.

For Daire, who has made 18 of the league's 21 trades, this changes his net after GW5 from -143 to -45.

### Won/lost counts

The ledger's Won and Lost columns just count that manager's trade verdicts (pending trades aren't counted). Because verdicts stop the clock and the ledger follows the whole chain, a manager can lose lots of individual trades and still be fine overall, or the other way round. Both are true, just measured differently.

## Other rules worth knowing

- **Bench points don't count.** A great player you bench scores nothing for you in these numbers. This is on purpose: it measures what the trade actually did for your H2H scores.
- **Dropped players:** if you trade for someone and later drop him for a waiver, his spell ends there. Whatever the replacement scores counts as waiver pick-up points, not trade points.
- **Getting a player back later:** if you trade a player away and later get him back (by trade or waiver), the original trade doesn't count his second spell with you. The move that brought him back does.
- **Given away, then passed on again:** your "given" only counts the player's spell with the manager you gave him to. If they pass him on, what he does next is on their record, not yours.
- **Which way a trade goes:** the manager who offered the trade receives each item's `element_in`, and the manager who accepted gets `element_out`.
- **Only processed trades are public.** Offers that were rejected or are still waiting are never seen.

## Options for the passed-on weak spot

| Option | How it works | Good | Less good |
|---|---|---|---|
| **A. Keep the maths, show the link** (recommended) | Same numbers, but a passed-on player says what he was traded on for, e.g. "Saka → back to Ross for Szoboszlai (GW2)", with a tap through to that trade | Easy to follow, no hidden rules, nothing counted twice | The first card's number still undersells a quick flip |
| B. Follow the chain | A passed-on player takes on the value of what he was traded for (split evenly if several players went in that trade) | The first card reflects the real outcome | Much harder to explain; splitting multi-player trades is arbitrary; one point can appear on two cards |
| C. Raw points | Judge every trade on each side's players' *total* FPL points since the trade, whoever owned them and whether benched or not | Very simple | Ignores what actually happened (benching, flips, drops), so it's not really "who won" |
