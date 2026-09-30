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

## 1. Trade verdict (follows the chain)

Decided with Adam on 2026-09-30, after he pointed out that stopping the clock marks a manager as losing a trade even when they instantly turned the player into something better.

For each trade, each player received is worth:

> **his points for that manager** (their XI, while they had him)
> **+ if they traded him on, his share of what they got for him**

"What they got for him" is worked out the same way, so the chain carries on through any number of onward trades. If he went out with other players, he gets an **equal share**: two players out means half each of what came back. Trades in FPL Draft are always even, so there's always something coming back.

- **Dropping** him (waiver or free agent) **ends the chain**. The replacement counts as waiver pick-up points, not trade points.
- Whoever's side is worth more is winning, by the difference (rounded to whole points).
- If no gameweek has been played since the trade, it's "Too early to call". An onward trade that hasn't played yet shows "too early to say".

Each card also shows a smaller **"on paper"** number: the players' total FPL points since the trade, whoever owned them and whether they were benched or not. It answers "who got the better players?", not "who won?".

### Adam's example

Daire gives Ndiaye to Ross for Saka, then passes Saka on for Bruno Fernandes before he plays. Ndiaye scores 2 for Ross, Saka 10, and Bruno 30 for Daire.

| Card | Daire's side | Other side | Verdict |
|---|---|---|---|
| Trade 1 | Saka: 0 for Daire, then traded on for Bruno = **30** | Ndiaye **2** | Daire +28 |
| Trade 2 | Bruno **30** | Saka **10** | Daire +20 |
| Overall table | gained 30 (Bruno), gave away 2 (Ndiaye) | | Daire **+28** |

Bruno's 30 appears on both cards, because both trades genuinely led to him. **The overall table never follows chains, so it never counts anything twice.** It's the single honest total.

This exact case is a test in `shared/moves.test.ts`.

### Real example: 26 August, GW2

At 08:03 Daire got Hill, Saka and Doku from Ross for Mitchell, Szoboszlai and Groß. By that evening Daire had passed all three on: Saka went straight back to Ross for Szoboszlai, Hill went into a 3-for-3 with Michael, and Doku into a 2-for-2 with Darragh.

- Before this rule, the card read **Ross 68, Daire 0**.
- Now Daire's side is Hill 10 (1/3 of the Michael trade) + Saka 7 (what Szoboszlai became) + Doku 4 (1/2 of the Darragh trade). Ross's side also follows *his* chain: Szoboszlai went straight back for Saka (23).
- It's still a clear Ross win, but the numbers now reflect what each of them actually did.

Across GW1-5 the rule changed the winner of two trades. Sarr for Tel went from Michael +1 to **Daire +9**, because Daire passed Tel into the Vuskovic trade. Michael v Ross (25 Aug) went from Michael +9 to **Ross +19**, because Ross turned Hill into a third of the Daire trade.

### Following the chain on a card

A player who was traded on shows a line like "↳ traded on in GW2 for Mitchell, Szoboszlai, Groß · 1/3 share = 30". Tapping it jumps to that trade's card.

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

The ledger's Won and Lost columns count that manager's trade verdicts (pending trades aren't counted). The cards and the ledger reach the same place by different routes: cards follow each player's chain, and the ledger adds up everything once. They can still differ, e.g. a manager can win several small trades and lose one big one.

## Other rules worth knowing

- **Bench points don't count.** A great player you bench scores nothing for you in these numbers. This is on purpose: it measures what the trade actually did for your H2H scores.
- **Dropped players:** if you trade for someone and later drop him for a waiver, his spell ends there. Whatever the replacement scores counts as waiver pick-up points, not trade points.
- **Getting a player back later:** if you trade a player away and later get him back (by trade or waiver), the original trade doesn't count his second spell with you. The move that brought him back does.
- **Given away, then passed on again:** your "given" only counts the player's spell with the manager you gave him to. If they pass him on, what he does next is on their record, not yours.
- **Which way a trade goes:** the manager who offered the trade receives each item's `element_in`, and the manager who accepted gets `element_out`.
- **Only processed trades are public.** Offers that were rejected or are still waiting are never seen.

## Options we considered

- **A. Stop the clock, show the link:** simple, but it marked instant flips as losses (Adam's Saka/Bruno example).
- **B. Follow the chain:** chosen. Its downsides are the arbitrary equal split for multi-player trades and the same points appearing on more than one card. Both are explained on the page, and the overall table doesn't double count.
- **C. Raw points:** kept only as the small "on paper" number, because it ignores benching, flips and drops.
