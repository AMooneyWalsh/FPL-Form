import { useMemo } from "react";
import { draftGrades, pickReports, squadOrigins } from "../../shared/draft";
import { tradeLedger, tradeVerdicts, waiverRecord } from "../../shared/moves";
import { fixtureLuck, headToHead, scores, streaks, type Score } from "../../shared/results";
import { computeStandings } from "../../shared/standings";
import { Manager, PlayerName, Pts, useShownManager } from "./bits";
import type { LeagueData } from "./data";
import { TradeCard } from "./TradesPage";

/** One manager's page (#/manager/123): everything about them in one place. */
export function ManagerPage({ id, data, myTeam }: { id: number; data: LeagueData; myTeam: number | null }) {
  const entry = data.entries.get(id);
  const ids = useMemo(() => [...data.entries.keys()], [data]);
  const standing = useMemo(() => computeStandings(data.league).find((r) => r.entryId === id), [data, id]);
  const verdicts = useMemo(
    () =>
      tradeVerdicts(data.trades, data.seasons, data.transactions).filter(
        (v) => v.offerer.entryId === id || v.receiver.entryId === id,
      ),
    [data, id],
  );
  const ledger = useMemo(() => tradeLedger(verdicts, ids).find((r) => r.entryId === id), [verdicts, ids, id]);
  const waivers = useMemo(
    () => waiverRecord(data.transactions, data.seasons, ids).find((r) => r.entryId === id),
    [data, ids, id],
  );
  const grades = useMemo(() => draftGrades(pickReports(data.draft, data.seasons)), [data]);
  const [, setShown] = useShownManager();
  const season = useMemo(() => seasonSummary(data, id, ids), [data, id, ids]);

  if (!entry) return <p className="notice">Couldn't find that manager.</p>;

  const mine = id === myTeam;
  const who = data.labels.get(id);
  const gradeRank = grades.findIndex((g) => g.entryId === id) + 1;
  const grade = grades[gradeRank - 1];
  const next = nextMatch(data, id);
  const record = next ? headToHead(data.league, id, next.opponent) : null;
  const lastGw = data.seasons.gameweeks.at(-1);
  const squad = lastGw?.squads[id];

  return (
    <>
      <section>
        <h2>
          {who}
          {mine && <span className="verdict"> (you)</span>}
        </h2>
        <p className="hint">{entry.entry_name}</p>
        {standing && (
          <div className="stat-row">
            <Stat label="Position" value={ordinal(standing.rank)} />
            <Stat label="Record" value={`${standing.won}-${standing.drawn}-${standing.lost}`} />
            <Stat label="Points" value={String(standing.total)} />
            <Stat label="Scored" value={String(standing.pointsFor)} />
          </div>
        )}
        {standing && standing.results.length > 0 && (
          <p className="form-line">
            Last five:{" "}
            <span className="form">
              {standing.results.slice(-5).map((r, i) => (
                <span key={i} className={`chip ${r}`}>
                  {r}
                </span>
              ))}
            </span>
          </p>
        )}
        {next && record && (
          <p>
            Next: gameweek {next.event} v <Manager id={next.opponent} data={data} mine={myTeam} />.{" "}
            <span className="muted">
              {record.matches.length === 0
                ? "First meeting this season."
                : `So far ${record.aWins}-${record.draws}-${record.bWins}.`}
            </span>
          </p>
        )}
      </section>

      {season && <SeasonSummary s={season} data={data} myTeam={myTeam} mine={mine} />}

      <section>
        <h2>Trades</h2>
        {ledger && ledger.trades > 0 ? (
          <p className="hint">
            {ledger.trades} {ledger.trades === 1 ? "trade" : "trades"}, won {ledger.won}, lost {ledger.lost}. Net{" "}
            <Pts n={ledger.net} signed /> points.
          </p>
        ) : (
          <p className="notice">No trades yet.</p>
        )}
        {verdicts.slice(0, 3).map((v) => (
          <TradeCard key={v.id} v={v} data={data} myTeam={myTeam} />
        ))}
        {verdicts.length > 3 && (
          <a className="link" href="#/moves/trades" onClick={() => setShown(id)}>
            See all {verdicts.length} trades
          </a>
        )}
      </section>

      <section>
        <h2>Waivers</h2>
        {waivers && waivers.claims + waivers.freeAgents > 0 ? (
          <p className="hint">
            Won {waivers.won} of {waivers.claims} waiver {waivers.claims === 1 ? "claim" : "claims"} ({waivers.outbid}{" "}
            lost to higher priority), plus {waivers.freeAgents} free {waivers.freeAgents === 1 ? "agent" : "agents"}.
            Everyone picked up has scored {waivers.pickupPoints} points for {mine ? "you" : who}.
          </p>
        ) : (
          <p className="notice">No pickups yet.</p>
        )}
      </section>

      {grade && (
        <section>
          <h2>Draft</h2>
          <p className="hint">
            Draft grade {ordinal(gradeRank)} of {grades.length}. The 15 picks have scored {grade.points} points, and{" "}
            {grade.kept} are still in the squad. Best pick: <PlayerName id={grade.best.element} data={data} detail={false} />{" "}
            (#{grade.best.index}). Worst: <PlayerName id={grade.worst.element} data={data} detail={false} /> (#
            {grade.worst.index}).
          </p>
          <a className="link" href="#/draft/grades">
            All draft grades
          </a>
        </section>
      )}

      {lastGw && squad && (
        <section>
          <h2>Squad in gameweek {lastGw.event}</h2>
          <ul className="plain squad-list">
            {[...squad.played, ...squad.bench].map((p, i) => (
              <li key={p} className={i >= squad.played.length ? "muted" : undefined}>
                <PlayerName id={p} data={data} />
                <span className="player-meta"> {lastGw.points[p] ?? 0} pts</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function nextMatch(data: LeagueData, entryId: number): { event: number; opponent: number } | null {
  const leagueId = data.entries.get(entryId)?.id;
  const byLeagueId = new Map([...data.entries.values()].map((e) => [e.id, e.entry_id]));
  const m = data.league.matches
    .filter((m) => !m.finished && (m.league_entry_1 === leagueId || m.league_entry_2 === leagueId))
    .sort((a, b) => a.event - b.event)[0];
  if (!m) return null;
  const other = m.league_entry_1 === leagueId ? m.league_entry_2 : m.league_entry_1;
  const opponent = byLeagueId.get(other);
  return opponent === undefined ? null : { event: m.event, opponent };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------------------------------------------------------- season in numbers

interface Summary {
  luck: { value: number; rank: number; of: number; luckyWins: number[]; unluckyLosses: number[] };
  high: Score;
  low: Score;
  average: number;
  bigWin: Score | null;
  bigLoss: Score | null;
  streak: { current: number; type: string | null; longestWin: number; longestUnbeaten: number };
  playersUsed: number;
  squadsUsed: number;
  top: { element: number; points: number }[];
  benchPoints: number;
  sources: { label: string; points: number }[];
}

function seasonSummary(data: LeagueData, id: number, ids: number[]): Summary | null {
  const mine = scores(data.league).filter((s) => s.entryId === id);
  if (mine.length === 0) return null;

  const luckRows = fixtureLuck(data.league);
  const luckRow = luckRows.find((r) => r.entryId === id);
  const byLuck = [...luckRows].sort((a, b) => b.luck - a.luck);

  const byScore = [...mine].sort((a, b) => b.score - a.score || a.event - b.event);
  const margin = (s: Score) => s.score - s.against;
  const wins = mine.filter((s) => s.result === "W").sort((a, b) => margin(b) - margin(a));
  const losses = mine.filter((s) => s.result === "L").sort((a, b) => margin(a) - margin(b));

  const st = streaks(data.league).find((r) => r.entryId === id);

  // Who has actually scored for them: points only count in the XI that played.
  const played = new Set<number>();
  const owned = new Set<number>();
  const pts = new Map<number, number>();
  let benchPoints = 0;
  for (const gw of data.seasons.gameweeks) {
    const sq = gw.squads[id];
    if (!sq) continue;
    for (const p of sq.played) {
      played.add(p);
      pts.set(p, (pts.get(p) ?? 0) + (gw.points[p] ?? 0));
    }
    for (const p of [...sq.played, ...sq.bench]) owned.add(p);
    for (const p of sq.bench) benchPoints += gw.points[p] ?? 0;
  }
  const top = [...pts].map(([element, points]) => ({ element, points })).sort((a, b) => b.points - a.points).slice(0, 3);

  const origins = squadOrigins(ids, data.seasons, {
    transactions: data.transactions,
    trades: data.trades,
    draft: data.draft,
  }).find((o) => o.entryId === id);
  const sources = origins
    ? [
        { label: "Draft", points: origins.points.draft },
        { label: "Waivers", points: origins.points.waiver },
        { label: "Free agents", points: origins.points["free agent"] },
        { label: "Trades", points: origins.points.trade },
      ].filter((x) => x.points !== 0)
    : [];

  return {
    luck: {
      value: luckRow?.luck ?? 0,
      rank: byLuck.findIndex((r) => r.entryId === id) + 1,
      of: byLuck.length,
      luckyWins: luckRow?.weeks.filter((w) => w.aboveMedian === false && w.result === "W").map((w) => w.event) ?? [],
      unluckyLosses: luckRow?.weeks.filter((w) => w.aboveMedian === true && w.result === "L").map((w) => w.event) ?? [],
    },
    high: byScore[0],
    low: byScore[byScore.length - 1],
    average: Math.round((mine.reduce((t, s) => t + s.score, 0) / mine.length) * 10) / 10,
    bigWin: wins[0] ?? null,
    bigLoss: losses[0] ?? null,
    streak: {
      current: st?.current ?? 0,
      type: st?.currentType ?? null,
      longestWin: st?.longestWin ?? 0,
      longestUnbeaten: st?.longestUnbeaten ?? 0,
    },
    playersUsed: played.size,
    squadsUsed: owned.size,
    top,
    benchPoints,
    sources,
  };
}

const STREAK_WORD: Record<string, [string, string]> = { W: ["win", "wins"], D: ["draw", "draws"], L: ["defeat", "defeats"] };

function SeasonSummary({ s, data, myTeam, mine }: { s: Summary; data: LeagueData; myTeam: number | null; mine: boolean }) {
  const gws = (list: number[]) => list.map((n) => `GW${n}`).join(", ");
  const luckWord = s.luck.value > 0 ? "jammy" : s.luck.value < 0 ? "hard done by" : "about even";
  const streakText =
    s.streak.type && s.streak.current > 0
      ? `${s.streak.current} ${STREAK_WORD[s.streak.type][s.streak.current === 1 ? 0 : 1]} in a row`
      : "None";
  return (
    <section>
      <h2>Season in numbers</h2>

      <h3 className="card-title">Luck</h3>
      <div className="stat-row">
        <Stat label="Luck" value={`${s.luck.value > 0 ? "+" : ""}${round1(s.luck.value)}`} />
        <Stat label="Luck rank" value={`${ordinal(s.luck.rank)}/${s.luck.of}`} />
        <Stat label="Lucky wins" value={String(s.luck.luckyWins.length)} />
        <Stat label="Unlucky losses" value={String(s.luck.unluckyLosses.length)} />
      </div>
      <p className="hint">
        {round1(s.luck.value) === 0
          ? `${mine ? "Your" : "Their"} results have matched ${mine ? "your" : "their"} scores so far.`
          : `${mine ? "You've" : "They've"} been ${luckWord}: ${s.luck.value > 0 ? "won" : "lost"} ${Math.abs(round1(s.luck.value))} more ${Math.abs(round1(s.luck.value)) === 1 ? "game" : "games"} than ${mine ? "your" : "their"} scores deserved.`}
        {s.luck.luckyWins.length > 0 && ` Won with a below-average score in ${gws(s.luck.luckyWins)}.`}
        {s.luck.unluckyLosses.length > 0 && ` Lost with an above-average score in ${gws(s.luck.unluckyLosses)}.`}{" "}
        <a className="link" href="#/league/luck">
          Luck table
        </a>
      </p>

      <h3 className="card-title">Scores</h3>
      <div className="stat-row">
        <Stat label={`Best (GW${s.high.event})`} value={String(s.high.score)} />
        <Stat label={`Worst (GW${s.low.event})`} value={String(s.low.score)} />
        <Stat label="Average" value={String(s.average)} />
        <Stat label="Bench pts" value={String(s.benchPoints)} />
      </div>
      <ul className="plain facts">
        {s.bigWin && (
          <li>
            Biggest win: {s.bigWin.score}-{s.bigWin.against} v <Manager id={s.bigWin.opponent} data={data} mine={myTeam} />{" "}
            <span className="player-meta">GW{s.bigWin.event}</span>
          </li>
        )}
        {s.bigLoss && (
          <li>
            Heaviest defeat: {s.bigLoss.score}-{s.bigLoss.against} v{" "}
            <Manager id={s.bigLoss.opponent} data={data} mine={myTeam} /> <span className="player-meta">GW{s.bigLoss.event}</span>
          </li>
        )}
        <li>
          Current run: {streakText}. Longest winning run {s.streak.longestWin}, longest unbeaten {s.streak.longestUnbeaten}.
        </li>
      </ul>

      <h3 className="card-title">Players</h3>
      <div className="stat-row">
        <Stat label="Have played" value={String(s.playersUsed)} />
        <Stat label="Owned" value={String(s.squadsUsed)} />
      </div>
      {s.top.length > 0 && (
        <ul className="plain facts">
          {s.top.map((t, i) => (
            <li key={t.element}>
              {i === 0 ? "Top scorer" : `${ordinal(i + 1)}`}: <PlayerName id={t.element} data={data} />{" "}
              <span className="player-meta">{t.points} pts</span>
            </li>
          ))}
        </ul>
      )}
      {s.sources.length > 0 && (
        <p className="hint">
          Points by where the players came from:{" "}
          {s.sources.map((x) => `${x.label} ${x.points}`).join(", ")}.
        </p>
      )}
    </section>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
