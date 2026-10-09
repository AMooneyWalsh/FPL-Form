// Renders an awards page to a 2160x2700 PNG (1080x1350 at 2x) for the group chat.
// Usage: node scripts/awards/render.mjs scripts/awards/gw5-awards.html out.png [height]
// Height defaults to 1350; match it to the page's body height (the GW6 preview is 1460).
// Needs playwright-core (npm i --no-save playwright-core) and Chromium at /opt/pw-browsers/chromium.
import { chromium } from "playwright-core";
import path from "node:path";
const [src, out = "awards.png", height = "1350"] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1080, height: Number(height) }, deviceScaleFactor: 2 });
await p.goto("file://" + path.resolve(src));
await p.waitForTimeout(1500);
await p.screenshot({ path: out });
await b.close();
