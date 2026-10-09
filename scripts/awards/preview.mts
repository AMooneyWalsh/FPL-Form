// Numbers for a gameweek preview graphic: each head-to-head with form, table
// position, a rough win chance, injuries, in-form players, new signings, and
// any trade history between the two. Usage: npx tsx scripts/awards/preview.mts [gw]
import { scores, streaks } from "../../shared/results";
import { squadStrength } from "../../shared/odds";
import { cancelReversals } from "../../shared/moves";
import { computeStandings, managerLabels } from "../../shared/standings";
const B = "https://draftyinhere.com/api/";
const g = async (p: string) => (await (await fetch(B + p)).json()).data;
const [league, players, trades, tx, own, game, fdr] = await Promise.all(
  ["league", "players", "trades", "transactions", "ownership", "game", "fdr"].map(g),
);
const gw = Number(process.argv[2] ?? game.next_event);
const L = managerLabels(league.league_entries);
const toEntry = new Map(league.league_entries.map((e: any) => [e.id, e.entry_id]));
const P = new Map(players.players.map((p: any) => [p.id, p]));
const name = (id: number) => (P.get(id) as any)?.name ?? id;
const table = computeStandings(league);
const rank = new Map(table.map((r, i) => [r.entryId, { pos: i + 1, ...r }]));
const done = scores(league);
const st = new Map(streaks(league).map((s) => [s.entryId, s]));
const squad = (e: number) => own.element_status.filter((s: any) => s.owner === e).map((s: any) => P.get(s.element) as any);
const all = done.map((s) => s.score);
const mean = all.reduce((a, b) => a + b, 0) / all.length;
const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length);
const strengths = new Map([...L.keys()].map((e) => [e, squadStrength(squad(e))]));
const avgStrength = [...strengths.values()].reduce((a, b) => a + b, 0) / strengths.size;
const expected = (e: number) => {
  const mine = done.filter((s) => s.entryId === e).map((s) => s.score);
  const avg = mine.reduce((a, b) => a + b, 0) / mine.length;
  return 0.5 * avg + 0.5 * mean * (strengths.get(e)! / avgStrength);
};
const phi = (x: number) => 0.5 * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x ** 3)));
const clubs = new Map(players.players.map((p: any) => [p.teamId, p.team]));
const fixtures = fdr.fixtures.filter((f: any) => f.event === gw);
const fixtureFor = (teamId: number) =>
  fixtures
    .filter((f: any) => f.home === teamId || f.away === teamId)
    .map((f: any) => (f.home === teamId ? `${clubs.get(f.away)} (H, ${f.homeDifficulty ?? "?"})` : `${clubs.get(f.home)} (A, ${f.awayDifficulty ?? "?"})`))
    .join(", ") || "BLANK";
const effective = cancelReversals(trades.trades).trades;
console.log("gw", gw, "league mean", mean.toFixed(1), "sd", sd.toFixed(1));
console.log("fixture keys", Object.keys(fdr.fixtures[0] ?? {}));
for (const m of league.matches.filter((m: any) => m.event === gw)) {
  const [a, b] = [toEntry.get(m.league_entry_1) as number, toEntry.get(m.league_entry_2) as number];
  const ea = expected(a), eb = expected(b);
  const pa = phi((ea - eb) / (sd * Math.SQRT2));
  console.log(`\n=== ${L.get(a)} v ${L.get(b)}  (win ${Math.round(pa * 100)}% / ${Math.round((1 - pa) * 100)}%, expect ${ea.toFixed(0)}-${eb.toFixed(0)})`);
  for (const e of [a, b]) {
    const r = rank.get(e)!;
    const s = st.get(e)!;
    const mine = done.filter((x) => x.entryId === e);
    const sq = squad(e);
    const out = sq.filter((p: any) => p.status !== "a").map((p: any) => `${p.name}(${p.status}${p.chanceNext ?? ""})`);
    const hot = [...sq].sort((x: any, y: any) => y.form - x.form).slice(0, 3).map((p: any) => `${p.name} f${p.form} ${fixtureFor(p.teamId)}`);
    const blanks = sq.filter((p: any) => fixtureFor(p.teamId) === "BLANK").map((p: any) => p.name);
    const signed = tx.transactions
      .filter((t: any) => t.entry === e && t.event === gw && t.result === "a")
      .map((t: any) => `${name(t.element_in)} for ${name(t.element_out)} (${t.kind})`);
    const traded = effective.filter((t: any) => t.event === gw && (t.offered_entry === e || t.received_entry === e));
    console.log(
      `  ${L.get(e)}: ${r.pos}th, ${r.points}pts, W${r.won}D${r.drawn}L${r.lost}, PF ${r.pointsFor}, form ${mine.slice(-3).map((x) => x.result).join("")}, streak ${s.current}${s.currentType}, scores ${mine.map((x) => x.score).join(",")}, strength ${strengths.get(e)!.toFixed(1)}`,
    );
    console.log(`    out/doubt: ${out.join(", ") || "-"}`);
    console.log(`    hot: ${hot.join(" | ")}`);
    if (blanks.length) console.log(`    no game: ${blanks.join(", ")}`);
    if (signed.length) console.log(`    signed GW${gw}: ${signed.join("; ")}`);
    if (traded.length) console.log(`    traded GW${gw}: ${traded.length}`);
  }
  const between = effective.filter(
    (t: any) => (t.offered_entry === a && t.received_entry === b) || (t.offered_entry === b && t.received_entry === a),
  );
  if (between.length)
    console.log(
      `  TRADE HISTORY: ${between.map((t: any) => `GW${t.event} ${L.get(t.offered_entry)} got ${t.tradeitem_set.map((i: any) => name(i.element_in)).join("+")} for ${t.tradeitem_set.map((i: any) => name(i.element_out)).join("+")}`).join("; ")}`,
    );
}
