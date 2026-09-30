# Setup and running

## For the owner: putting the site online (one time, ~10 minutes)

1. Go to https://dash.cloudflare.com/sign-up and create a free account.
2. In the Cloudflare dashboard, open **Workers & Pages** in the left menu.
3. Click **Create**, then **Import a repository** (it may say "Connect to Git").
4. Click **Connect GitHub**, sign in, and allow access to the **FPL-Form** repository.
5. Pick **FPL-Form**. When it asks for settings:
   - Project name: `drafty-in-here`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Leave everything else as it is.
6. Click **Deploy**. After a minute or two it shows a link ending in `.workers.dev`. That's the site.
7. Send Claude the link.

From then on, every change merged into `main` goes live on its own.

## For Claude: developing

- `npm install`, then `npm run check` runs typecheck, tests and build (same as CI).
- `npm run dev` runs Vite on 5173 and proxies `/api` to `wrangler dev` on 8787 (run `npx wrangler dev` alongside).
- In the Claude cloud sandbox, `wrangler dev` can't reach FPL (workerd bypasses the sandbox proxy, gets 403). Test the Worker with the mocked unit tests and the UI against `fixtures/` instead.
- Refresh fixtures with curl from `https://draft.premierleague.com/api/...` (works through the sandbox proxy). `fixtures/fpl-fixtures.json` comes from the main game instead: `https://fantasy.premierleague.com/api/fixtures/?future=1`.
- Settings: `LEAGUE_ID` and `DEFAULT_ENTRY_ID` in `wrangler.jsonc`. Change `LEAGUE_ID` each August.
- Optional KV "last good" store: create a KV namespace (Cloudflare dashboard, Storage & Databases, KV) and add it to `wrangler.jsonc` as `"kv_namespaces": [{ "binding": "LAST_GOOD", "id": "<namespace id>" }]`. Don't rely on Wrangler's auto-provisioning (no id): it failed the Workers Builds preview build on PR #2. Without it the site still works, it just can't show saved data in a brand new Worker instance while FPL is down.

## Layout

```
app/        React site (Vite root; the old site still owns the root index.html)
worker/     Cloudflare Worker: /api/* routes, caching, fallbacks
shared/     Types and league maths, used by both, unit tested
fixtures/   Real FPL responses for league 634 (GW5) used by tests
docs/
```
