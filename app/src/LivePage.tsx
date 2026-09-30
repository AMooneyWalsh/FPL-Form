import { useMemo, useState } from "react";
import {
  liveMatches,
  liveTable,
  type LiveGameweek,
  type LiveMatch,
  type LivePlayer,
  type LiveSquad,
  type PlayerInfo,
} from "../../shared/live";
import type { Envelope } from "../../shared/types";
import { useApi } from "./api";
import { Manager } from "./bits";
import type { LeagueData } from "./data";
import { StandingsTable } from "./StandingsTable";

type Phase = "upcoming" | "live" | "done";

export function LivePage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const event = data.game.current_event;
  const live = useApi<Envelope<LiveGameweek>>(`/api/live/${event}`, 60);
  const hasNext = data.game.current_event_finished && data.league.matches.some((m) => m.event === event + 1);
  const next = useApi<Envelope<LiveGameweek>>(hasNext ? `/api/live/${event + 1}` : null, 3600);

  if (event < 1) return <p className="notice">The season hasn't started yet. Live scores appear here from gameweek 1.</p>;
  if (live.status === "loading") return <p className="notice">Loading gameweek {event}…</p>;
  if (live.status === "error") return <p className="notice error">Couldn't load the live scores. {live.message}</p>;
  return (
    <LiveView
      gw={live.value.data}
      next={hasNext && next.status === "ready" ? next.value.data : null}
      data={data}
      myTeam={myTeam}
    />
  );
}

function phaseOf(gw: LiveGameweek): Phase {
  if (gw.fixtures.length === 0 || gw.fixtures.every((f) => !f.started)) return "upcoming";
  if (gw.fixtures.every((f) => f.finishedProvisional)) return "done";
  return "live";
}

function LiveView({
  gw,
  next,
  data,
  myTeam,
}: {
  gw: LiveGameweek;
  next: LiveGameweek | null;
  data: LeagueData;
  myTeam: number | null;
}) {
  const info = useMemo(
    () => new Map<number, PlayerInfo>(data.playerList.map((p) => [p.id, { position: p.position, teamId: p.teamId }])),
    [data],
  );
  const matches = useMemo(() => liveMatches(data.league, gw, info, data.rules), [data, gw, info]);
  const table = useMemo(() => liveTable(data.league, gw.event, matches), [data, gw, matches]);
  const phase = phaseOf(gw);
  const played = gw.fixtures.filter((f) => f.finishedProvisional).length;
  const mine = (m: LiveMatch) => m.homeEntry === myTeam || m.awayEntry === myTeam;
  const ordered = [...matches].sort((a, b) => Number(mine(b)) - Number(mine(a)));

  return (
    <>
      <section>
        <div className="section-head">
          <h2>Gameweek {gw.event}</h2>
          <span className={`phase phase-${phase}`}>
            {phase === "live" ? "Live" : phase === "done" ? "Finished" : "Not started"}
          </span>
        </div>
        <p className="hint">
          {phase === "live" &&
            `${played} of ${gw.fixtures.length} matches finished. Bonus is provisional until FPL confirms it, and auto-subs are FPL's likely ones. Updates every minute.`}
          {phase === "done" &&
            (gw.fixtures.every((f) => f.finished)
              ? "All matches finished and FPL has confirmed the points."
              : "All matches are over. FPL is still confirming bonus and subs, so scores may move a little.")}
          {phase === "upcoming" && firstKickoff(gw) && `First kick-off ${formatKickoff(firstKickoff(gw)!)}.`}
        </p>
        {Object.keys(gw.picks).length === 0 && (
          <p className="notice">Lineups appear here once the deadline passes.</p>
        )}
        {ordered.map((m, i) => (
          <MatchCard key={i} m={m} data={data} myTeam={myTeam} startOpen={mine(m) && phase !== "upcoming"} />
        ))}
      </section>

      {phase === "live" && (
        <section>
          <h2>Table if it ended now</h2>
          <StandingsTable rows={table} myTeam={myTeam} />
        </section>
      )}

      {next && (
        <section>
          <h2>Next up: gameweek {next.event}</h2>
          <p className="hint">
            {firstKickoff(next) ? `First kick-off ${formatKickoff(firstKickoff(next)!)}.` : "Fixtures to be confirmed."}
          </p>
          <div className="card">
            <ul className="plain pairings">
              {data.league.matches
                .filter((m) => m.event === next.event)
                .map((m) => {
                  const toEntry = (id: number) => data.league.league_entries.find((e) => e.id === id)?.entry_id ?? 0;
                  const a = toEntry(m.league_entry_1);
                  const b = toEntry(m.league_entry_2);
                  return (
                    <li key={`${a}-${b}`} className={a === myTeam || b === myTeam ? "is-mine" : undefined}>
                      <Manager id={a} data={data} /> <span className="muted">v</span> <Manager id={b} data={data} />
                    </li>
                  );
                })}
            </ul>
          </div>
        </section>
      )}

      <section>
        <h2>Premier League fixtures</h2>
        <PlFixtures gw={gw} data={data} />
      </section>
    </>
  );
}

// ---------------------------------------------------------------- matches

function MatchCard({ m, data, myTeam, startOpen }: { m: LiveMatch; data: LeagueData; myTeam: number | null; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const h = m.home?.score ?? null;
  const a = m.away?.score ?? null;
  const leader = h === null || a === null || h === a ? null : h > a ? m.homeEntry : m.awayEntry;
  return (
    <article className={`card match ${m.homeEntry === myTeam || m.awayEntry === myTeam ? "mine-card" : ""}`}>
      <button className="match-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Side entry={m.homeEntry} squad={m.home} data={data} leading={leader === m.homeEntry} />
        <span className="match-score">
          <span className={leader === m.homeEntry ? "lead" : undefined}>{h ?? "–"}</span>
          <span className="muted">–</span>
          <span className={leader === m.awayEntry ? "lead" : undefined}>{a ?? "–"}</span>
        </span>
        <Side entry={m.awayEntry} squad={m.away} data={data} leading={leader === m.awayEntry} right />
      </button>
      {open && m.home && m.away && (
        <div className="lineups">
          <Lineup squad={m.home} data={data} />
          <Lineup squad={m.away} data={data} />
        </div>
      )}
      {!(m.home && m.away) && open && <p className="hint">Lineups appear once the deadline passes.</p>}
    </article>
  );
}

function Side({
  entry,
  squad,
  data,
  leading,
  right,
}: {
  entry: number;
  squad: LiveSquad | null;
  data: LeagueData;
  leading: boolean;
  right?: boolean;
}) {
  return (
    <span className={`match-side ${right ? "right" : ""}`}>
      <span className={leading ? "match-name lead" : "match-name"}>{data.labels.get(entry)}</span>
      {squad && (
        <span className="player-meta">{squad.toPlay > 0 ? `${squad.toPlay} to play` : "all played"}</span>
      )}
    </span>
  );
}

const STATUS: Record<LivePlayer["status"], { mark: string; label: string }> = {
  played: { mark: "✓", label: "Played" },
  playing: { mark: "●", label: "Playing now" },
  "to-play": { mark: "·", label: "Still to play" },
  "did-not-play": { mark: "✕", label: "Didn't play" },
  "no-game": { mark: "✕", label: "No game this week" },
};

function Lineup({ squad, data }: { squad: LiveSquad; data: LeagueData }) {
  const xi = squad.players.filter((p) => p.counts);
  const bench = squad.players.filter((p) => !p.counts);
  const row = (p: LivePlayer) => (
    <li key={p.element} className={`lineup-row status-${p.status}`}>
      <span className="lineup-mark" title={STATUS[p.status].label} aria-label={STATUS[p.status].label}>
        {STATUS[p.status].mark}
      </span>
      <span className="lineup-name">
        {data.players.get(p.element)?.name ?? p.element}
        {p.subbedIn && <span className="sub-in" title="Auto-sub in"> ↑</span>}
        {p.subbedOut && <span className="sub-out" title="Auto-sub out"> ↓</span>}
      </span>
      <span className="lineup-pts">
        {p.points}
        {p.provisionalBonus > 0 && <span className="prov" title="Provisional bonus"> +{p.provisionalBonus}b</span>}
      </span>
    </li>
  );
  return (
    <div className="lineup">
      <ul className="plain">{xi.map(row)}</ul>
      <div className="bench-label">Bench</div>
      <ul className="plain bench">{bench.map(row)}</ul>
    </div>
  );
}

// ---------------------------------------------------------------- PL fixtures

function PlFixtures({ gw, data }: { gw: LiveGameweek; data: LeagueData }) {
  const teams = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of data.playerList) m.set(p.teamId, p.team);
    return m;
  }, [data]);
  const fixtures = [...gw.fixtures].sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "") || a.id - b.id);
  return (
    <div className="card">
      <ul className="plain fixture-list">
        {fixtures.map((f) => (
          <li key={f.id}>
            <span className="fx-team">{teams.get(f.teamH)}</span>
            <span className="fx-score">
              {f.started ? `${f.scoreH ?? 0}–${f.scoreA ?? 0}` : f.kickoff ? formatKickoff(f.kickoff, true) : "TBC"}
            </span>
            <span className="fx-team right">{teams.get(f.teamA)}</span>
            <span className="fx-state muted">{f.finishedProvisional ? "FT" : f.started ? `${f.minutes}'` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function firstKickoff(gw: LiveGameweek): string | null {
  return gw.fixtures.map((f) => f.kickoff).filter((k): k is string => !!k).sort()[0] ?? null;
}

function formatKickoff(iso: string, short = false): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", short
    ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
    : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
