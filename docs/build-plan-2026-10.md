# Build plan: backlog batch (21 Oct 2026)

The owner picked backlog items 1, 2, 3, 5, 6, 7, 8 and 10 (`docs/backlog.md`). Built in parallel by four helpers, each on its own branch, then merged one group at a time after `npm run check` and phone screenshots.

No new FPL data is needed: everything comes from what the site already loads (`LeagueData` in `app/src/data.ts`).

## Shared foundation (done first)

- Links can carry settings after a `?`, e.g. `#/league/h2h?a=1412&b=72619`. `routeFromHash` ignores them; pages read them with `hashParams()` and update them with `replaceHashParams()` (both in `bits.tsx`), which doesn't scroll the page.

## Group A: trading tools (Moves tab)

**1. Trade checker** (`#/moves/checker`). Pick a manager to trade with, tap players on both sides. Each player shows form, points a game, season points, injury flag, next three fixtures (FPL difficulty colours) and a rating (the waiver suggestion formula, moved into one shared function so both use the same number). Shows each side's total, what it does to each manager's best starting XI, and warns if the positions don't match (squads must keep their shape). The link carries the trade so it can be sent to the other manager.

**2. Trade partners** (`#/moves/partners`). For the viewer (or any manager), how strong each squad is in each position compared with the league. Lists the best partners: managers strong where you're weak and weak where you're strong, with a suggested swap of spare players that improves both starting XIs, and a button that opens it in the checker.

## Group B: league (League tab, Waivers, manager page)

**3. Power rankings** (`#/league/power`). A ranking that mixes recent scores, season average, an all-play record (how many of the other 13 you'd have beaten each week, which takes fixture luck out) and the strength of the squad right now (so trades count straight away). Arrows show movement since last week, plus how far each manager is from their table position.

**5. Waiver order** (top of `#/moves/waivers`, and on the manager page). Straight from FPL's `waiver_pick` on each league entry, which FPL updates as the season goes on.

**10. Rivalry pages** (League > Head to head, `#/league/h2h?a=&b=`). Grows the head to head view: the tale of the tape side by side, every meeting, "if they'd played every week", trades between them and who's ahead on them, waiver battles they've both been in, and players who have played for both. Linked from every manager page.

## Group C: trade history and recap

**6. Trade grades over time.** Each trade card, when opened, shows who was ahead after every gameweek since the trade, so you can see a trade swing. Built by replaying the verdict with the season cut off at each gameweek, so the last point always matches the card's verdict.

**7. Weekly recap** (`#/league/recap?gw=`). An auto-written roundup of any finished gameweek: headlines, every result, then awards (manager of the week, wooden spoon, biggest win, closest match, jammiest win, most robbed, bench of shame, player of the week, signing of the week, trade of the week, table movers). Facts come from one shared function so the share image can reuse them.

## Group D: share cards

**8. Share cards.** A share button on Live matches, trade cards, manager pages (and the recap once merged). It draws a picture of the card, shows a preview, then opens the phone's share sheet (WhatsApp included) or saves the image where sharing isn't supported.

## Rules every group follows

- `docs/design-system.md` first; tokens only; reuse `bits.tsx`; new shared pieces go on `#/styleguide`.
- Logic in `shared/` with unit tests against `fixtures/`; UI in `app/src/`.
- `npm run check` passes; phone screenshots at 390px, light and dark, no sideways scroll.
- Plain English, cheeky house style, no em dashes.
