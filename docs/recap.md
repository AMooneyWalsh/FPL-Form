# Weekly recap

League > Recap (`#/league/recap?gw=7`). An auto-written roundup of any finished gameweek (every match finished). It opens on the latest; the "‹ Gameweek n ›" picker steps back, and the link carries the week so it can be shared.

Code: `shared/recap.ts` (facts and words, tests in `shared/recap.test.ts`), page in `app/src/RecapPage.tsx`. `scripts/regression.ts` builds every week's recap from live data.

## Two steps: facts, then words

1. `gameweekRecap(sources, gw)` turns a gameweek into plain facts: every match, every score, and each award's winners and numbers, as entry and player ids. No wording, so a share image can use it too.
2. `recapWords(facts, names)` writes them up: 2 to 4 headlines and a list of award cards (title, managers, the number, one or two short sentences). Names come in through `names`, so the same words work anywhere.

## What's in it

- **Headlines**: who topped the week (or that they still lost), the result of the week (the biggest win, or "also had the biggest win" if it was the same manager), the top of the table (new leader and who they knocked off, weeks in a row on top, or how far clear). A fourth line if someone's on 4+ wins or defeats in a row, or jumped 4+ places.
- **Results**: every match, winner in bold, your match highlighted.
- **Awards**, in this order, each skipped when it doesn't apply:

| Award | How it's picked |
|---|---|
| Manager of the week | Highest score |
| Wooden spoon | Lowest score |
| Biggest win | Biggest winning margin |
| Closest match | Smallest margin, draws included. Skipped if every match was won by the same margin. |
| Jammiest win | Lowest winning score, only if it was below the week's median (the same idea as fixture luck) |
| Most robbed | Highest losing score, only if it was above the median |
| Bench of shame | Most points on the bench (squad minus the XI that counted, after auto-subs). Needs 5 or more. |
| Player of the week | Top points by a player in someone's XI, and whose. Adds a free agent who scored more, if there was one. |
| Signing of the week | Best waiver or free agent pick-up for that gameweek, by points in the XI that week. A player signed twice in a week counts once. |
| Trade of the week | Of the trades made for that gameweek, the biggest lead after it, scored exactly like the trade cards (it's the first point of the card's week by week). |
| Climber / Faller | Biggest move up or down the table since the gameweek before (2+ places; none in the first gameweek) |
| Streak watch | Anyone on 3+ wins or defeats in a row: one card for wins, one for defeats |

Ties name everyone ("Ross and Mark", "Brobbey for Conor and Semenyo for Ruairi M, 17 each").

## Writing rules

From `scripts/awards/README.md`: a friendly roast, names not pronouns, one idea per sentence, short, no em dashes. Each award has a few phrasings; which one is used depends on the gameweek number, so the words change week to week but never on a refresh. A test checks there are no pronouns or em dashes.
