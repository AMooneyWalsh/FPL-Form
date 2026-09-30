// Pulls the league's current data straight from FPL and runs every calculation
// the site does, checking them against FPL's own numbers and each other.
// Run: npx tsx scripts/regression.ts   (needs network access to FPL)
import { buildGameweek, squadScore, type RawLive, type RawPicks } from "../shared/gameweek";
import { draftGrades, draftOnlyTable, hindsightRedraft, pickReports, squadOrigins } from "../shared/draft";
import { liveMatches, toLiveGameweek, type LivePicks, type PlayerInfo, type RawLiveResponse } from "../shared/live";
import { cancelReversals, playerJourney, Seasons, tradeLedger, tradeVerdicts, waiverBattles, waiverRecord } from "../shared/moves";
import { fixtureLuck, positionsByGameweek, records, streaks } from "../shared/results";
import { computeStandings } from "../shared/standings";
import type { DraftChoice, GameStatus, LeagueDetails, PlayersPayload, Trade, Transaction } from "../shared/types";
import { trimPlayers } from "../worker/index";

const LEAGUE = Number(process.env.LEAGUE_ID ?? 634);
const API = "https://draft.premierleague.com/api/";
const get = async (path: string) => {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
};
let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

const game = JSON.parse(await get("game")) as GameStatus;
const league = JSON.parse(await get(`league/${LEAGUE}/details`)) as LeagueDetails & { standings: any[] };
const { players, rules } = JSON.parse(trimPlayers(await get("bootstrap-static"))) as PlayersPayload;
const trades = (JSON.parse(await get(`draft/league/${LEAGUE}/trades`)) as { trades: Trade[] }).trades;
const transactions = (JSON.parse(await get(`draft/league/${LEAGUE}/transactions`)) as { transactions: Transaction[] }).transactions;
const draft = (JSON.parse(await get(`draft/${LEAGUE}/choices`)) as { choices: DraftChoice[] }).choices;
const entries = league.league_entries.map((e) => e.entry_id);
console.log(`League ${LEAGUE}: GW${game.current_event} (${game.current_event_finished ? "finished" : "in progress"}), ${entries.length} managers, ${trades.length} trades, ${transactions.length} transactions\n`);

// Standings vs FPL's own table.
const table = computeStandings(league);
check(
  league.standings.every((s) => {
    const r = table.find((x) => x.leagueEntryId === s.league_entry)!;
    return r.won === s.matches_won && r.drawn === s.matches_drawn && r.lost === s.matches_lost && r.total === s.total && r.pointsFor === s.points_for && r.pointsAgainst === s.points_against && r.rank === s.rank;
  }),
  "League table matches FPL's standings (W/D/L, points, for/against, rank)",
);

// Every gameweek's squads reproduce every H2H score.
const gws = [];
const info = new Map<number, PlayerInfo>(players.map((p) => [p.id, { position: p.position, teamId: p.teamId }]));
for (let gw = 1; gw <= game.current_event; gw++) {
  const [live, ...picks] = await Promise.all([get(`event/${gw}/live`), ...entries.map((e) => get(`entry/${e}/event/${gw}`))]);
  const byEntry: Record<number, RawPicks> = {};
  entries.forEach((e, i) => (byEntry[e] = JSON.parse(picks[i])));
  const g = buildGameweek(gw, JSON.parse(live) as RawLive, byEntry);
  gws.push(g);
  const toEntry = new Map(league.league_entries.map((e) => [e.id, e.entry_id]));
  const matches = league.matches.filter((m) => m.event === gw && m.finished);
  check(
    matches.every((m) => squadScore(g, toEntry.get(m.league_entry_1)!) === m.league_entry_1_points && squadScore(g, toEntry.get(m.league_entry_2)!) === m.league_entry_2_points),
    `GW${gw}: squads reproduce all ${matches.length * 2} H2H scores`,
  );
  // Live scoring gives the same answer.
  const lg = toLiveGameweek(gw, JSON.parse(live) as RawLiveResponse, byEntry as unknown as Record<number, LivePicks>);
  const lm = liveMatches(league, lg, info, rules);
  check(
    lm.every((m) => {
      const real = matches.find((x) => toEntry.get(x.league_entry_1) === m.homeEntry);
      return !real || (m.home!.score === real.league_entry_1_points && m.away!.score === real.league_entry_2_points);
    }),
    `GW${gw}: live scoring (bonus + subs) reproduces every H2H score`,
  );
}
const seasons = new Seasons(gws);

// Trades.
const { trades: effective, reversals } = cancelReversals(trades);
const verdicts = tradeVerdicts(effective, seasons, transactions);
check(verdicts.length === effective.length, `Trade verdicts for all ${effective.length} trades (${reversals.length} same-GW swap-backs cancelled)`);
check(verdicts.every((v) => [v.offerer, v.receiver].every((s) => s.received.every((p) => Math.abs(p.value - (p.points + (p.onward?.value ?? 0))) < 1e-9))), "Every traded player's value = his points + onward share");
const ledger = tradeLedger(verdicts, entries);
check(ledger.reduce((s, r) => s + r.trades, 0) === verdicts.length * 2, "Trade ledger counts every trade twice");

// Waivers.
const record = waiverRecord(transactions, seasons, entries);
check(record.reduce((s, r) => s + r.claims, 0) === transactions.filter((t) => t.kind === "w").length, "Waiver record counts every claim");
const battles = waiverBattles(transactions, seasons);
check(battles.every((b) => new Set(b.claims.map((c) => c.entryId)).size === b.claims.length && b.claims.length >= 2), `${battles.length} waiver battles, one line per manager`);

// Journeys and origins.
const moves = { transactions, trades: effective, draft };
const owned = new Set(gws.flatMap((g) => Object.values(g.squads).flatMap((s) => [...s.played, ...s.bench])));
check([...owned].every((el) => playerJourney(el, seasons, moves).every((s) => s.how !== "unknown")), `All ${owned.size} players ever owned have a known origin`);
const origins = squadOrigins(entries, seasons, moves);
check(origins.every((o) => Object.values(o.points).reduce((a, b) => a + b, 0) === table.find((r) => r.entryId === o.entryId)!.pointsFor), "Squad origins add up to every manager's points-for");

// Draft.
const picks = pickReports(draft, seasons);
check(picks.reduce((s, p) => s + p.value, 0) === 0, `Pick values balance to zero across ${picks.length} picks`);
check(draftGrades(picks).length === entries.length, "Draft grades for every manager");
const positions = new Map(players.map((p) => [p.id, p.position]));
check(draftOnlyTable(league, draft, seasons, positions, rules).every((r) => r.played === table[0].played), "Draft-only table plays the same number of games");
const redraft = hindsightRedraft(draft, seasons, players, rules);
check(new Set(redraft.map((r) => r.hindsight)).size === redraft.length, "Hindsight redraft never picks a player twice");

// League tab.
const luck = fixtureLuck(league);
check(luck.every((l) => l.wins === table.find((r) => r.entryId === l.entryId)!.won), "Fixture luck wins match the table");
check(positionsByGameweek(league).at(-1)!.positions.get(table[0].entryId) === 1, "Position chart ends with the real leader top");
check(streaks(league).length === entries.length && records(league).highest.length > 0, "Streaks and records build");

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
