# Navigation and page architecture review (30 Sept 2026)

Status: the owner chose option A. Both steps are built. Step 1: four tabs, landing page, sticky section menus, Draft sections. Step 2: every player name links to `#/player/{id}` and every manager name (and league-table team) to `#/manager/{id}`. The "Show" manager filter is shared across pages for the visit. Player pages are full pages with a Back link rather than pop-ups, and the Player journeys search stays under Moves (chip "Journeys").

Added since: manager page "Season in numbers" with coloured league ranks, and Moves > Suggestions (waiver suggestions). The "How the site is laid out today" section below describes the layout before this work.

## How the site is laid out today

- Six top tabs in this order: Trades, Waivers, Draft, Players, League, Live. Unknown links land on Trades.
- League (Table, Form, Luck, Head to head, Records) and Live (Matches, Bonus, Fixtures) have chip sub-menus with their own links (`#/league/luck`).
- Draft (5 sections), Trades (2) and Waivers (2) are single long scrolls with no sub-menu.
- Players keeps the chosen player in memory only, not in the link.
- Each page has its own "Show" manager filter, which resets when you change page.

## Problems, by user journey

1. **"What's the score right now?"** (the most common visit on a Saturday). Live is the last tab and the site opens on Trades, so it's always two taps and a hunt.
2. **"Where am I in the table?"** League is fifth of six. The table is the most basic thing a league site shows.
3. **"Tell me about this player."** Player names everywhere (trades, waivers, draft, lineups) are plain text. You have to go to Players and type the name. The phone's back button leaves the Players page instead of going back to the search results, and you can't send a friend a link to a player.
4. **"How's my team / Ben's team doing?"** There's no manager page. A manager's trades, waivers, draft grade, H2H and form are spread over five tabs, and the manager filter has to be picked again on each.
5. **Long pages without a map.** Draft is five big sections. You scroll to find "Hindsight redraft" with no way to jump there or link to it.
6. **Two levels of menu that look different.** Top tabs are a purple bar, sub-menus are chips that scroll away. Once you scroll down a League view you have to scroll back up to switch.
7. **Six tabs is the limit on a 360px phone.** Adding anything (waiver suggestions in step 6, a manager page) won't fit.

## Recommendation

Group the six tabs into four, ordered by how often people want them, and make players and managers clickable everywhere.

| New tab | Contains | Why |
|---|---|---|
| **Live** (first; the landing page while games are on) | Matches, Bonus, Fixtures | Matchday is when everyone opens the site |
| **League** (landing page otherwise) | Table, Form, Luck, H2H, Records | The basics |
| **Moves** | Trades, Waivers (and step 6 waiver suggestions later) | The differentiator, kept together, one tap from anywhere |
| **Draft** | Grades, Steals and busts, Redraft, etc., as chips | Same page, with a sub-menu and links |

Plus:

- **Player pop-up:** tap any player name to open their journey in a panel, with its own link (`#/player/123`). The Players tab's search moves into that panel and the header, so Players no longer needs a tab.
- **Manager page:** tap any manager name for one page with their trades, waivers, draft grade, form and next opponent.
- **Sticky sub-menu:** the chips stay pinned under the top bar while you scroll.
- **Manager filter remembered** across pages.
- Old links (`#/trades`, `#/players`, `#/table`) keep working and redirect.

### Options

- **A. Full recommendation above.** Biggest improvement, about two to three sessions of work.
- **B. Quick wins only:** reorder tabs (Live, League, Trades, Waivers, Draft, Players), smart landing page, sticky sub-menus, player links in the URL. Keeps six tabs, so step 6 still has nowhere to go. One session.
- **C. B now, A later.** Low risk, but some work gets redone.

Recommended: **A**, done in two steps (tabs and sticky menus first, then player pop-up and manager page) so each can be checked on the live site.
