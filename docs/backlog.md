# Backlog (market research, 1 Oct 2026)

What similar sites offer that we don't, and which of those fit this league. Nothing here is agreed yet; the owner picks.

## Who we looked at

- **draftfpl.live** (closest rival, FPL Draft companion): live H2H, standings, draft vs waiver points, waiver suggestions, a paid Pro tier, and a Discord bot that posts waiver reminders and gameweek recaps.
- **Sleeper analysers** (SleeperBoard, ffwrapped, My Fantasy Analyzer, StatChasers): power rankings, playoff/title odds, weekly recaps, trade grades that update as values change, manager profiles, league history and a shareable "Wrapped" season story.
- **Trade calculators** (FantasyPros, RotoTrade, DLF): "should I do this trade?" before it happens, and "find me a trade partner" from squad strengths and weaknesses.
- **Main-game FPL tools** (LiveFPL, FPL Review, Fantasy Football Hub): fixture tickers, price/form trends, captaincy and expected points projections.

Most of our existing features (trade verdicts, ledger, network, steals and busts, hindsight redraft, luck) are already ahead of draftfpl.live. The gaps are mostly forward-looking tools and shareable fun.

## Effort key

S = an afternoon, M = a session, L = several sessions or needs new data.

## Now (fits the trade and draft focus)

| # | Feature | What it does | Seen at | Effort |
|---|---------|--------------|---------|--------|
| 1 | **Trade checker** | Pick players on both sides of a possible trade and see form, fixtures and value for each side before proposing it. | FantasyPros, RotoTrade | M |
| 2 | **Trade partner finder** | For each manager, show who is short where you are strong (e.g. they lack a fit striker, you have three). | DLF league analyser | M |
| 3 | **Power rankings** | A weekly ranking mixing recent scores, form and luck, with arrows for movers. Better guide than the H2H table. | Sleeper tools | S |
| 4 | **Title and forfeit odds** (BUILT, League > Odds) | Simulate the rest of the season from scoring averages and the fixture list. Follow-up: show week-to-week change. | Sleeper tools | M |
| 5 | **Current waiver order** | Who is next in line on waivers. Already raised, not built. | draftfpl.live | S |
| 6 | **Trade grades over time** | Show how each trade's verdict swung week by week, not just the total. | My Fantasy Analyzer | S |

## Next (fun and sharing)

| # | Feature | What it does | Seen at | Effort |
|---|---------|--------------|---------|--------|
| 7 | **Weekly recap page** | Auto-written roundup of each gameweek (biggest win, worst bench, trade of the week). Could feed the awards graphic. | draftfpl.live, Sleeper | M |
| 8 | **WhatsApp-ready share cards** | One-tap image of a match result, trade verdict or manager card to post in the group chat. | ffwrapped | M |
| 9 | **Season "Wrapped"** | End-of-season story per manager: best trade, worst drop, luckiest week. | ffwrapped | L |
| 10 | **Rivalry pages** | All-time record between any two managers, with trades between them. Extends H2H. | Sleeper tools | S |

## Later (needs new data or setup)

| # | Feature | What it does | Seen at | Effort |
|---|---------|--------------|---------|--------|
| 11 | **Reminders** (waiver deadline, kickoff) | A message before the deadline. Needs a WhatsApp or Discord hook, which WhatsApp makes awkward. | draftfpl.live Discord bot | L |
| 12 | **xG over/under performance** | Who is lucky or due a goal, from per-gameweek stats. Already raised. | FPL Review, Hub | M |
| 13 | **Fixture ticker for my squad** | Colour grid of the next 5 gameweeks for each of my players. | LiveFPL, Hub | S |
| 14 | **League history** | Past seasons' tables and records (last season was league 6573 in `data.json`). | Sleeper tools | M |
| 15 | **Pre-season draft board** | Rankings and a cheat sheet to use on draft day next August. | FantasyPros | L |

## Not doing

- Paid tier, accounts, ads: a private site for 14 friends.
- Hosting our own draft or waivers: the official game does that (decided 30 Sep).

## Sources

- https://www.draftfpl.live/ and https://www.draftfpl.live/league.html
- https://myfantasyanalyzer.com/, https://ffwrapped.com/sleeper-league-analyzer, https://sleeperboard.web.app/
- https://www.fantasypros.com/2026/07/best-dynasty-fantasy-football-trade-tools/, https://www.rototrade.com/, https://dynastyleaguefootball.com/tools/
