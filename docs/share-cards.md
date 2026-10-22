# Share cards

A "Share" button on Live matches, opened trade cards and manager pages. It draws a picture of that thing, shows a preview, and then opens the phone's share sheet (WhatsApp included) or saves the image where sharing isn't supported. The pictures are for the league chat, so the site only gets one small line at the bottom ("draftyinhere.com"), like the awards graphics in `scripts/awards/`.

## How it works

Three layers, so the words can be tested and the drawing reused:

1. **`shared/share.ts`: what goes on the card.** A `ShareCard` is plain data: a purple band (`kicker`, usually the league name, then `title`, optional `subtitle` and `tag`), a list of `blocks`, the `caption` sent with the picture and a `file` name. Builders here make the match card (`matchCard`) and the trade card (`tradeCard`); tests in `shared/share.test.ts` run them on real GW5 and trade fixtures. Also here: `trimToWidth` / `wrapToWidth` (long names are cut short with "…", never split mid-emoji) and `slug`.
2. **`app/src/share.ts`: the drawing.** `drawShareCard(card)` draws on a canvas, `shareImage(card)` returns a PNG blob. No libraries, just Canvas 2D.
   - The picture is the site drawn as a 360px-wide phone at 3x: 1080 wide, and every size, space and corner token is used ×3. The hero numbers (scores) are `--fs-xxl` × 1.75.
   - Colours are the **light theme** tokens, read from the top `:root` rule in `styles.css` (not the dark media query), so a picture looks the same whatever theme the phone is in. No colours are typed in TypeScript.
   - Font: the site's own stack, read from `body`.
   - Height grows with the content, never below square. Keep cards under 1350 tall (4:5) so chat apps show them whole. Today: match about 1250, trade 1185 with two players a side (each extra player adds about 70), manager about 1280.
3. **`app/src/ShareButton.tsx`: the button and preview.** `<ShareButton what="Ben v Joe" card={() => ...} />`. `card` only runs on tap, so the picture is of that moment. The preview sheet is rendered into `document.body` (like the search sheet), draws the picture, then offers:
   - **Share**, only where `navigator.canShare({ files })` is true (phones). It calls `navigator.share({ files: [png], text: caption })` straight from its own tap, which iPhones insist on; that's why there's a preview step instead of sharing from the first tap. Cancelling the share sheet is ignored; any other failure shows a notice suggesting Save image.
   - **Save image**, always: an `<a download>` on a blob URL. The URL is revoked when the sheet closes.
   - A hint that pressing and holding the picture also copies or saves it.

The manager card is built in `ManagerPage.tsx` (`managerShareCard`), because it reuses that page's season summary and `rankOf` league ranks, so the picture says exactly what the page says.

## Blocks

| Block | What it draws | Used by |
|---|---|---|
| `versus` | Two panels side by side: name, detail, a big number, optional badge and note, then rows. `highlight` makes a panel green (winner). Rows line up across both panels. | Match, trade |
| `stats` | Tiles like `StatTile`, with optional league rank coloured by tone. Four across uses `--fs-lg` (like the site); fewer get bigger numbers. `columns` to wrap. | Manager |
| `form` | A label and W/D/L chips. | Manager |
| `lines` | A card of "label ... value" rows under an optional title. | Style guide example (and the weekly recap, later) |
| `headline` | One big statement with a line or two under it. | Style guide example |

Tones are meanings, as on the site: `good` green, `bad` red, `neutral` grey, `live` red. Tags and badges are outlined while something can still change (live, or FPL hasn't confirmed the gameweek) and solid once final, like the W/L chips on Live.

## Adding a new card (e.g. the weekly recap)

1. Write a builder that returns a `ShareCard`. If it only needs `shared/` data, put it in `shared/share.ts` with a test; if it needs a page's own sums, put it next to them, as the manager card does.
2. Use the blocks above; add a new block kind only if none fits (a type in `shared/share.ts`, a draw function in `app/src/share.ts`, and an example on `#/styleguide` via `exampleShareCard`).
3. Drop `<ShareButton what="..." card={() => yourCard(...)} />` where it belongs, never inside a `.fold-btn` or a link. Use `shareNames(data)` for names.
4. Check the picture: open it on `#/styleguide` or the page, or use a headless browser to tap the button and save the preview image's blob. Plain English, no em dashes, under 1350 tall.

## Browser support

- Sharing files: Safari on iPhone (iOS 15+) and Chrome on Android. Desktop browsers mostly can't, so they get Save image only.
- Some apps on iPhone have been known to drop the caption text when a picture is shared with it. The picture always goes; the caption is a bonus.
- Drawing needs only Canvas 2D (`roundRect` isn't used, so older iPhones are fine). Letter spacing on the small capitals is skipped on browsers without `ctx.letterSpacing`.
