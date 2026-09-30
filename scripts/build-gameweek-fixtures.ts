// Turns raw FPL responses in fixtures/gw/ into the compact fixtures/gameweeks.json
// the tests use. Run with: node scripts/build-gameweek-fixtures.ts
import fs from "node:fs";
import { buildGameweek, type RawLive, type RawPicks } from "../shared/gameweek.ts";

const dir = "fixtures/gw";
const files = fs.readdirSync(dir);
const events = [...new Set(files.filter((f) => f.startsWith("live-")).map((f) => Number(f.slice(5, -5))))].sort((a, b) => a - b);
const out = events.map((gw) => {
  const live = JSON.parse(fs.readFileSync(`${dir}/live-${gw}.json`, "utf8")) as RawLive;
  const picks: Record<number, RawPicks> = {};
  for (const f of files.filter((f) => f.startsWith("picks-") && f.endsWith(`-${gw}.json`))) {
    picks[Number(f.split("-")[1])] = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
  }
  return buildGameweek(gw, live, picks);
});
fs.writeFileSync("fixtures/gameweeks.json", JSON.stringify(out));
console.log(`Wrote ${out.length} gameweeks`);
