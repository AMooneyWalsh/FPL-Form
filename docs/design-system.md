# Design system

The rules for how the site looks. **Read this before changing anything visual.** Every Claude session starts without memory of how the last one styled things, and that is how the site drifted to 16 text sizes and green meaning six different things (see `docs/ux-review-2026-10-10.md`). This file is the shared memory.

See it all on one page at **`#/styleguide`** (not in the menus), in light and dark. Tokens live at the top of `app/src/styles.css`; shared pieces live in `app/src/bits.tsx`.

## The three rules

1. **No raw values.** Below the token block in `styles.css`, never type a hex colour, `rgba()`, a `font-size` in px or a `border-radius` in px. Use a token, or add one to the token block (light *and* dark) and to the style guide page. The only exceptions are text inside SVG charts (drawn in chart units) and the 2px yellow/red card shapes.
2. **Colour means something.** Pick the token by what it means, never by what colour you want.
3. **Reuse before you build.** If a piece below fits, use it. If you need something new and it will appear in more than one place, add it to `bits.tsx` and the style guide.

Check before merging: `grep -nE "#[0-9a-fA-F]{3,6}\b|rgba\(|font-size: [0-9]|border-radius: [0-9]+px" app/src/styles.css` should only find the token block, the SVG chart text and the card shapes.

## Colour

| Meaning | Tokens | Used for |
|---|---|---|
| Surfaces | `--bg`, `--surface`, `--text`, `--muted`, `--line` | Page, cards, text, hints, borders |
| Brand | `--brand`, `--brand-text`, `--on-brand-subtle`, `--on-brand-line` | The purple header and tabs only |
| Selected | `--active-bg`, `--active-text` | The selected chip in a menu or filter |
| **You** | `--mine`, `--mine-edge`, `--mine-text`, `--on-mine-edge` | Your row, card, name or pill. Always purple. |
| **Good** | `--good`, `--good-bg`, `--good-text` | Wins, plus points, top third of the league, a claim won, "Starting" |
| Neither | `--neutral` | Draws, nothing either way |
| **Bad** | `--bad`, `--bad-bg`, `--bad-text` | Losses, minus points, bottom third, "Out", errors |
| Warning | `--warn-bg`, `--warn-text` | Doubtful players, "Bench", stale-data notices |
| **Live** | `--live` | Happening now (same red as bad, by football convention) |
| Text on fills | `--on-color` (white), `--ink` (dark) | Text on a solid coloured badge |
| Football | `--bonus`, `--yellow-card`, `--fdr-1` to `--fdr-5` | Bonus badge, cards, fixture difficulty |
| Charts | `--series-1` to `--series-4`, `--net-edge` | Series 1 is always the viewer, series 2 whoever they compare with |

Things that are **not** green: your own row (purple), links (text colour with a soft underline), the active tab (white underline), deadlines (white).

**"You" looks the same everywhere:** a `--mine` tint with a 3px `--mine-edge` bar on the left (rows), or a `--mine-edge` border (cards). Your name is bold `--mine-text`.

## Text sizes

Six sizes and no others.

| Token | Size | Use |
|---|---|---|
| `--fs-xxl` | 32px | One hero number per page at most (head to head score) |
| `--fs-xl` | 22px | Site title, match and fixture scores |
| `--fs-lg` | 18px | Section titles (`h2`), stat tile numbers, big verdicts |
| `--fs-md` | 15px | Body text, names in lists, tabs |
| `--fs-sm` | 13px | Hints, details under a name, table text, chips |
| `--fs-xs` | 11px | Tags, badges, uppercase column headings. Nothing longer than a few words. |
| `--fs-input` | 16px | Every input and dropdown. Below 16px, iPhones zoom in when you tap it. |

Weights: 400 body, 600 names and labels, 700 numbers that matter and headings, 800 only for live scores.

## Spacing and corners

- Spacing: `--sp-1` 4px, `--sp-2` 8px, `--sp-3` 12px, `--sp-4` 16px, `--sp-5` 24px, `--sp-6` 32px. New CSS uses only these. Some older dense Live rules still use 2, 3, 6 or 10px; tidy them when you're in there anyway.
- Corners: `--r-sm` 4px (tags, badges, W/L chips), `--r-md` 8px (inner panels, inputs), `--r-lg` 12px (cards, tables, notices, tiles), `--r-pill` (chips, owner pills). `50%` for dots and round buttons.
- Page side gutter is 16px. Nothing scrolls sideways at 360px.
- Tap targets: at least 32px tall for anything you tap on purpose (chips, buttons, dropdowns). Inline names in text are the exception.

## Building blocks (`app/src/bits.tsx`)

| Piece | What it's for |
|---|---|
| `SubNav` | The sticky chip menu under the tabs. One per tab. |
| `SectionHead` | A section title (`h2`) with its controls on the right (Show filter, picker, Live tag). |
| `Explainer` | "How this works": anything longer than one line of hint goes in here, folded away. Numbers first, explanation on request. |
| `FoldSection` | A titled group that folds away with a count, e.g. "Gameweek 5 · 12 battles". Newest open, older folded. |
| `.fold-btn` | The tappable top of a card that opens and folds it (trade cards, Live fixtures and bonus). Folded, it shows a one or two line summary. Never put links inside it. |
| `Tag` | Small status label. Tones: `good`, `warn`, `bad`, `neutral`, `mine`, `live`. |
| `InjuryFlag` | Out / Ban / 75% next to a player's name (a `Tag`). |
| `StatTile` | One number with a label and optional league rank. Put 2 to 4 in a `.stat-row`. |
| `ScrollTable` | Every data table goes in one. On a phone it scrolls sideways with the first column frozen and fades the edge that has more. |
| `RowNo` | A place or pick number at the start of a frozen first cell ("1", "3rd"). |
| `ShowFilter` | "Show: Everyone / Me / any manager" for long lists. Shared across pages. |
| `PlayerName`, `Manager` | Every player and manager name, always a link to their page. Never inside a button. |
| `Pts` | A points number; `signed` shows +/- in good/bad colours. |

CSS-only patterns: `.card` (and `.mine-card`), `.table-wrap` + `table.data` (with `tr.mine`), `.notice` / `.notice.warn` / `.notice.error`, `.chips` + `.chip-btn`, `.form` + `.chip.W/D/L`, `.fdr-1..5`, `.hint`, `a.link`.

## Tables

- Every table is a `ScrollTable` around a `table.data`. Never hide columns on small screens (the old `hide-narrow` is gone); a table that's too wide scrolls.
- Column order: first, who the row is about, with their place or number as a `RowNo` (this column is frozen). Next, the one number that matters most (points, net, pick-up points), so it's always on screen. Then the rest, most useful first.
- Nothing wraps inside a table. Long names trim with "…" (see `.standings .team-names`).
- Your row: `tr.mine`.

## Long lists

- Anything that grows all season (trades, waiver battles, matches) folds. Show the newest or most relevant open and the rest as one or two line summaries you tap to open.
- What starts open: things happening now (a live match), and things about you (a match with your players in it). Open/closed is only a starting point; once someone taps, leave it alone, even when the data refreshes.
- Matches are listed by day in kick-off order, with day headings ("Today", "Saturday 17 October") and each kick-off time, before, during and after the gameweek.
- Section menus (`SubNav`) fade at an edge when there are more chips past it.

## Words

- Plain English. No jargon a new friend wouldn't know (we replaced "on paper" with "in all", "drop gone" with "void", "vs slot" with "vs draft spot", "outbid" with "lost out"); if a number needs a name, explain it in an `Explainer`.
- One line of `.hint` under a section title at most. Anything longer goes in an `Explainer`.
- Friendly and a bit cheeky ("Jammiest", "Most robbed") is the house style. No em dashes.
