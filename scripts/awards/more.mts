import { computeStandings, managerLabels } from "../../shared/standings";
import { scores } from "../../shared/results";
const B = "https://drafty-in-here.amooneywalsh.workers.dev/api/";
const g = async (p: string) => (await (await fetch(B + p)).json()).data;
const league = await g("league"), game = await g("game"), players = await g("players");
const L = managerLabels(league.league_entries); const P = new Map(players.players.map((p: any) => [p.id, p]));
console.log(computeStandings(league).map(r => [r.rank, L.get(r.entryId), `${r.won}-${r.drawn}-${r.lost}`, r.total, r.pointsFor]));
const sc = scores(league).sort((a,b)=>b.score-a.score); console.log("high", sc.slice(0,2).map(s=>[L.get(s.entryId), s.score, s.event, L.get(s.opponent), s.against]));
console.log("low", sc.slice(-3).map(s=>[L.get(s.entryId), s.score, s.event, L.get(s.opponent), s.against]));
const losses = sc.filter(s=>s.result==="L").sort((a,b)=>b.score-a.score); console.log("best losing score", [L.get(losses[0].entryId), losses[0].score, losses[0].event, L.get(losses[0].opponent), losses[0].against]);
const wins = sc.filter(s=>s.result==="W").sort((a,b)=>a.score-b.score); console.log("worst winning", [L.get(wins[0].entryId), wins[0].score, wins[0].event, L.get(wins[0].opponent), wins[0].against]);
const bench = new Map<number, number>(); const out = new Map<number, number>();
for (let i = 1; i <= game.current_event; i++) { const gw = await g(`gw/${i}`); for (const [e, s] of Object.entries<any>(gw.squads)) { bench.set(+e, (bench.get(+e) ?? 0) + s.bench.reduce((t: number, p: number) => t + (gw.points[p] ?? 0), 0)); } }
console.log("bench", [...bench].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([e,v])=>[L.get(e), v]));
const own = await g("ownership"); const inj = new Map<number, string[]>();
for (const s of own.element_status) { const p: any = P.get(s.element); if (s.owner && p && p.status !== "a") inj.set(s.owner, [...(inj.get(s.owner) ?? []), p.name + "(" + p.status + ")"]); }
console.log("injuries", [...inj].sort((a,b)=>b[1].length-a[1].length).slice(0,3).map(([e,v])=>[L.get(e), v]));
