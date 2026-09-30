import { useMemo } from "react";
import { draftGrades, pickReports } from "../../shared/draft";
import { tradeLedger, tradeVerdicts, waiverRecord } from "../../shared/moves";
import { headToHead } from "../../shared/results";
import { computeStandings } from "../../shared/standings";
import { Manager, PlayerName, Pts } from "./bits";
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
        {verdicts.map((v) => (
          <TradeCard key={v.id} v={v} data={data} myTeam={myTeam} />
        ))}
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
