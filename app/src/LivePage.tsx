import { useMemo, useState } from "react";
import {
  bonusTable,
  gamesOf,
  leagueOwners,
  liveMatches,
  liveTable,
  topPerformers,
  type EventKey,
  type LiveFixture,
  type LiveGameweek,
  type LiveMatch,
  type LivePlayer,
  type LiveSquad,
  type Owner,
  type Performer,
  type PlayerInfo,
} from "../../shared/live";
import { computeStandings, type StandingRow } from "../../shared/standings";
import type { Envelope } from "../../shared/types";
import { useApi } from "./api";
import { Manager } from "./bits";
import type { LeagueData } from "./data";
import { StandingsTable } from "./StandingsTable";

export const LIVE_VIEWS = [
  { id: "matches", label: "Matches" },
  { id: "bonus", label: "Bonus" },
  { id: "fixtures", label: "Fixtures" },
] as const;
export type LiveView = (typeof LIVE_VIEWS)[number]["id"];

type Phase = "upcoming" | "live" | "done";

interface Club {
  short: string;
  code: number;
}

/** Everything the three views share, worked out once. */
interface Ctx {
  data: LeagueData;
  gw: LiveGameweek;
  myTeam: number | null;
  phase: Phase;
  clubs: Map<number, Club>;
  matches: LiveMatch[];
  owners: Map<number, Owner>;
  table: StandingRow[];
}

export function LivePage({ data, myTeam, view }: { data: LeagueData; myTeam: number | null; view: LiveView }) {
  const event = data.game.current_event;
  const live = useApi<Envelope<LiveGameweek>>(event >= 1 ? `/api/live/${event}` : null, 60);
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
      view={view}
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
  view,
}: {
  gw: LiveGameweek;
  next: LiveGameweek | null;
  data: LeagueData;
  myTeam: number | null;
  view: LiveView;
}) {
  const ctx = useMemo((): Ctx => {
    const info = new Map<number, PlayerInfo>(data.playerList.map((p) => [p.id, { position: p.position, teamId: p.teamId }]));
    const clubs = new Map<number, Club>();
    for (const p of data.playerList) clubs.set(p.teamId, { short: p.team, code: p.teamCode });
    const phase = phaseOf(gw);
    const matches = liveMatches(data.league, gw, info, data.rules);
    return {
      data,
      gw,
      myTeam,
      phase,
      clubs,
      matches,
      owners: leagueOwners(matches),
      table: phase === "upcoming" ? computeStandings(data.league) : liveTable(data.league, gw.event, matches),
    };
  }, [data, gw, myTeam]);

  return (
    <>
      <nav className="chips" aria-label="Live sections">
        {LIVE_VIEWS.map((v) => (
          <a key={v.id} href={`#/live/${v.id}`} className={v.id === view ? "chip-btn active" : "chip-btn"}>
            {v.label}
          </a>
        ))}
      </nav>
      {view === "matches" && <MatchesView ctx={ctx} next={next} />}
      {view === "bonus" && <BonusView ctx={ctx} />}
      {view === "fixtures" && <FixturesView ctx={ctx} />}
    </>
  );
}

// ---------------------------------------------------------------- matches

function MatchesView({ ctx, next }: { ctx: Ctx; next: LiveGameweek | null }) {
  const { gw, phase, data, myTeam } = ctx;
  const played = gw.fixtures.filter((f) => f.finishedProvisional).length;
  const mine = (m: LiveMatch) => m.homeEntry === myTeam || m.awayEntry === myTeam;
  const ordered = [...ctx.matches].sort((a, b) => Number(mine(b)) - Number(mine(a)));
  const hasLineups = Object.keys(gw.picks).length > 0;

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
            `${played} of ${gw.fixtures.length} matches finished. Updates every minute. Bonus is provisional (*) until FPL confirms it, and auto-subs are FPL's likely ones.`}
          {phase === "done" &&
            (gw.fixtures.every((f) => f.finished)
              ? "All matches finished and FPL has confirmed the points."
              : "All matches are over. FPL is still confirming bonus and subs, so scores may move a little.")}
          {phase === "upcoming" && firstKickoff(gw) && `First kick-off ${formatKickoff(firstKickoff(gw)!)}.`}
        </p>
        {hasLineups && (
          <p className="hint">
            Tap a match for both lineups, then a player for where his points came from.{" "}
            <span className="lv-key">
              <Dot status="played" /> played <Dot status="playing" /> playing <Dot status="to-play" /> still to play
            </span>
          </p>
        )}
        {!hasLineups && <p className="notice">Lineups appear here once the deadline passes.</p>}
        {ordered.map((m) => (
          <MatchCard key={`${m.homeEntry}-${m.awayEntry}`} m={m} ctx={ctx} startOpen={mine(m) && phase !== "upcoming"} />
        ))}
      </section>

      {phase === "live" && (
        <section>
          <h2>Table if it ended now</h2>
          <StandingsTable rows={ctx.table} myTeam={myTeam} />
        </section>
      )}

      {phase !== "upcoming" && <Performers ctx={ctx} />}

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
    </>
  );
}

function MatchCard({ m, ctx, startOpen }: { m: LiveMatch; ctx: Ctx; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const { phase, myTeam } = ctx;
  const h = m.home?.score ?? null;
  const a = m.away?.score ?? null;
  const result = (mine: number | null, theirs: number | null) =>
    mine === null || theirs === null ? null : mine > theirs ? "W" : mine < theirs ? "L" : "D";
  const isMine = m.homeEntry === myTeam || m.awayEntry === myTeam;
  return (
    <article className={`card match ${isMine ? "mine-card" : ""}`}>
      <button className="lv-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <MatchSide entry={m.homeEntry} squad={m.home} ctx={ctx} />
        <span className="lv-score">
          <span className="lv-nums">
            <span>{h ?? "–"}</span>
            <span className="muted">–</span>
            <span>{a ?? "–"}</span>
          </span>
          {phase !== "upcoming" && m.home && m.away && (
            <span className="lv-chips">
              <span className={`lv-res ${result(h, a)} ${phase}`}>{result(h, a)}</span>
              <span className={`lv-res ${result(a, h)} ${phase}`}>{result(a, h)}</span>
            </span>
          )}
        </span>
        <MatchSide entry={m.awayEntry} squad={m.away} ctx={ctx} right />
      </button>
      {open && m.home && m.away && (
<Lineups home={m.home} away={m.away} ctx={ctx} />
      )}
      {open && !(m.home && m.away) && <p className="hint lv-pad">Lineups appear once the deadline passes.</p>}
      {!open && <span className="sr-only">Tap for lineups</span>}
    </article>
  );
}

function MatchSide({ entry, squad, ctx, right }: { entry: number; squad: LiveSquad | null; ctx: Ctx; right?: boolean }) {
  const row = ctx.table.find((r) => r.entryId === entry);
  const team = ctx.data.entries.get(entry)?.entry_name;
  return (
    <span className={`lv-side ${right ? "right" : ""}`}>
      <span className="lv-name">
        {ctx.data.labels.get(entry)}
        {row && ctx.phase !== "upcoming" && <sup className="lv-rank">{row.rank}</sup>}
      </span>
      <span className="lv-team">{team}</span>
      {row && (
        <span className="lv-rec">
          {row.won}-{row.drawn}-{row.lost}
        </span>
      )}
      {squad && <Dots squad={squad} />}
    </span>
  );
}

function Dot({ status }: { status: LivePlayer["status"] }) {
  return <span className={`lv-dot ${status}`} aria-hidden="true" />;
}

function Dots({ squad }: { squad: LiveSquad }) {
  const counting = squad.players.filter((p) => p.counts);
  return (
    <span
      className="lv-dots"
      role="img"
      aria-label={`${counting.length - squad.toPlay} of ${counting.length} players have played or are playing, ${squad.toPlay} still to play`}
    >
      {counting.map((p) => (
        <Dot key={p.element} status={p.status} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- lineups


/**
 * Both lineups side by side as one table: row n holds each side's nth player,
 * so the two rows always line up even when one player has more to show.
 */
function Lineups({ home, away, ctx }: { home: LiveSquad; away: LiveSquad; ctx: Ctx }) {
  // In the order the manager set them: auto-subs are shown as notes, not moves.
  const play = ctx.data.rules.play;
  const bySlot = (a: LivePlayer, b: LivePlayer) => a.slot - b.slot;
  const split = (s: LiveSquad) => ({
    xi: s.players.filter((p) => p.slot <= play).sort(bySlot),
    bench: s.players.filter((p) => p.slot > play).sort(bySlot),
  });
  const h = split(home);
  const a = split(away);
  const rows = (left: LivePlayer[], right: LivePlayer[], bench: boolean) =>
    Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [
      <Cell key={`h${i}`} p={left[i]} squad={home} bench={bench} ctx={ctx} />,
      <Cell key={`a${i}`} p={right[i]} squad={away} bench={bench} ctx={ctx} />,
    ]);
  return (
    <div className="lv-lineups" role="table" aria-label="Lineups">
      {rows(h.xi, a.xi, false)}
      <div className="lv-bench-label">
        Bench <span className="lv-bench-pts">{home.benchPoints} pts</span>
      </div>
      <div className="lv-bench-label">
        Bench <span className="lv-bench-pts">{away.benchPoints} pts</span>
      </div>
      {rows(h.bench, a.bench, true)}
    </div>
  );
}

function Cell({ p, squad, bench, ctx }: { p?: LivePlayer; squad: LiveSquad; bench: boolean; ctx: Ctx }) {
  if (!p) return <div className="lv-row empty" />;
  return <PlayerRow p={p} squad={squad} bench={bench} ctx={ctx} />;
}

const STAT_LABELS: Record<string, string> = {
  minutes: "Minutes played",
  goals_scored: "Goals",
  assists: "Assists",
  clean_sheets: "Clean sheet",
  goals_conceded: "Goals conceded",
  own_goals: "Own goals",
  penalties_saved: "Penalties saved",
  penalties_missed: "Penalties missed",
  yellow_cards: "Yellow cards",
  red_cards: "Red cards",
  saves: "Saves",
  bonus: "Bonus",
  defensive_contribution: "Defensive contribution",
};

/** Stats where "×3" means something (not minutes or the defensive-contribution total). */
const COUNTED = new Set(["goals_scored", "assists", "own_goals", "penalties_saved", "penalties_missed", "yellow_cards", "red_cards", "saves", "goals_conceded"]);

/** "90 MP, 1 GS, 13 DC": the stats that matter, only when they happened. */
function statParts(p: LivePlayer): string[] {
  const s = p.stats;
  const out: string[] = [];
  if (s.minutes) out.push(`${s.minutes}\u00a0MP`);
  if (s.goals_scored) out.push(`${s.goals_scored}\u00a0GS`);
  if (s.assists) out.push(`${s.assists}\u00a0A`);
  if (s.clean_sheets) out.push(`${s.clean_sheets}\u00a0CS`);
  if (s.goals_conceded && (p.position === "GKP" || p.position === "DEF")) out.push(`${s.goals_conceded}\u00a0GC`);
  if (s.saves) out.push(`${s.saves}\u00a0S`);
  if (s.penalties_saved) out.push(`${s.penalties_saved}\u00a0PS`);
  if (s.penalties_missed) out.push(`${s.penalties_missed}\u00a0PM`);
  if (s.own_goals) out.push(`${s.own_goals}\u00a0OG`);
  if (p.bonus) out.push(`${p.bonus}\u00a0B`);
  if (p.provisionalBonus) out.push(`${p.provisionalBonus}\u00a0B*`);
  if (s.defensive_contribution) out.push(`${s.defensive_contribution}\u00a0DC`);
  if (s.yellow_cards) out.push(`${s.yellow_cards}\u00a0YC`);
  if (s.red_cards) out.push(`${s.red_cards}\u00a0RC`);
  return out;
}

/** "NFO 0 - 1 COV | FT", "BHA 1 - 0 ARS | 67'", or "LEE v CRY | Sun 13:00". */
function fixtureLines(teamId: number, ctx: Ctx): string[] {
  const games = gamesOf(teamId, ctx.gw);
  if (games.length === 0) return ["No game this week"];
  return games.map((f) => {
    const h = ctx.clubs.get(f.teamH)?.short ?? "?";
    const a = ctx.clubs.get(f.teamA)?.short ?? "?";
    if (!f.started) return `${h} v ${a} | ${f.kickoff ? formatKickoff(f.kickoff, true) : "TBC"}`;
    return `${h} ${f.scoreH ?? 0} - ${f.scoreA ?? 0} ${a} | ${f.finishedProvisional ? "FT" : `${f.minutes}'`}`;
  });
}

function Shirt({ teamId, gk, ctx }: { teamId: number; gk: boolean; ctx: Ctx }) {
  const [failed, setFailed] = useState(false);
  const club = ctx.clubs.get(teamId);
  if (!club || failed) return <span className="lv-shirt fallback">{club?.short ?? "?"}</span>;
  return (
    <img
      className="lv-shirt"
      src={`/api/shirt/${club.code}${gk ? "_1" : ""}`}
      alt=""
      width={28}
      height={28}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function PlayerRow({ p, squad, bench, ctx }: { p: LivePlayer; squad: LiveSquad; bench: boolean; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const player = ctx.data.players.get(p.element);
  const parts = statParts(p);
  const other = (p.subFor ? ctx.data.players.get(p.subFor)?.name : undefined) ?? "a starter";
  // Until FPL confirms the subs they are our projection of what will happen.
  const pending = ctx.phase !== "done" && !squad.officialSubs;
  const blank = !bench && p.counts && (p.status === "did-not-play" || p.status === "no-game");
  const note = p.subbedIn
    ? { cls: "in", text: pending ? `Will come on for ${other}` : `Came on for ${other}` }
    : p.subbedOut
      ? { cls: "out", text: pending ? `Didn't play, ${other} will come on` : `0 mins, replaced by ${other}` }
      : blank
        ? { cls: "out", text: ctx.phase === "done" ? "Didn't play, no sub could come on" : "Didn't play, no sub available yet" }
        : null;
  const benchNo = bench ? (p.position === "GKP" ? "GK" : String(p.slot - ctx.data.rules.play - 1)) : null;
  return (
    <div className={`lv-row ${!p.counts ? (bench ? "benched" : "off") : ""} ${p.status}`} role="cell">
      <button className="lv-row-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Shirt teamId={p.teamId} gk={p.position === "GKP"} ctx={ctx} />
        <span className="lv-row-body">
          <span className="lv-row-name">
            {benchNo && <span className="lv-bench-no">{benchNo}</span>}
            {player?.name ?? `Player ${p.element}`}
          </span>
          {note && <span className={`lv-note ${note.cls}`}>{note.text}</span>}
          {parts.length > 0 && <span className="lv-row-stats">{parts.join(", ")}</span>}
          {fixtureLines(p.teamId, ctx).map((line) => (
            <span key={line} className="lv-row-fix">
              {line}
            </span>
          ))}
        </span>
        <span className="lv-row-pts">{p.points}</span>
      </button>
      {open && <Breakdown p={p} />}
    </div>
  );
}

function Breakdown({ p }: { p: LivePlayer }) {
  const lines = p.breakdown.filter(([, , pts]) => pts !== 0);
  const total = p.points;
  if (lines.length === 0 && p.provisionalBonus === 0) return <div className="lv-breakdown muted">No points yet.</div>;
  return (
    <ul className="lv-breakdown plain">
      {lines.map(([stat, value, pts]) => (
        <li key={stat}>
          <span>
            {STAT_LABELS[stat] ?? stat}
            {COUNTED.has(stat) && value > 1 && <span className="muted"> ×{value}</span>}
          </span>
          <span className={pts < 0 ? "pts-neg" : undefined}>{pts > 0 ? `+${pts}` : pts}</span>
        </li>
      ))}
      {p.provisionalBonus > 0 && (
        <li>
          <span>Bonus (provisional)</span>
          <span>+{p.provisionalBonus}</span>
        </li>
      )}
      <li className="total">
        <span>Total</span>
        <span>{total}</span>
      </li>
    </ul>
  );
}

// ---------------------------------------------------------------- performers

function Performers({ ctx }: { ctx: Ctx }) {
  const { best, benched } = useMemo(() => topPerformers(ctx.matches, 5), [ctx.matches]);
  if (best.length === 0) return null;
  return (
    <section>
      <h2>Stars and regrets</h2>
      <div className="two-col">
        <PerformerList title="Top scorers" rows={best} ctx={ctx} />
        <PerformerList title="Left on the bench" rows={benched} ctx={ctx} empty="Nobody who scored is on a bench." />
      </div>
    </section>
  );
}

function PerformerList({ title, rows, ctx, empty }: { title: string; rows: Performer[]; ctx: Ctx; empty?: string }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {rows.length === 0 && <p className="hint">{empty}</p>}
      <ol className="plain lv-perf">
        {rows.map((r) => {
          const player = ctx.data.players.get(r.element);
          return (
            <li key={r.element} className={r.entryId === ctx.myTeam ? "is-mine" : undefined}>
              <Shirt teamId={player?.teamId ?? 0} gk={player?.position === "GKP"} ctx={ctx} />
              <span className="lv-perf-name">
                {player?.name}
                <span className="player-meta">
                  {" "}
                  <Manager id={r.entryId} data={ctx.data} />
                </span>
              </span>
              <strong>{r.points}</strong>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- bonus

function BonusView({ ctx }: { ctx: Ctx }) {
  const table = useMemo(() => bonusTable(ctx.gw), [ctx.gw]);
  const started = table.filter((t) => t.rows.length > 0);
  const waiting = table.filter((t) => t.rows.length === 0);
  return (
    <section>
      <h2>Bonus points</h2>
      <p className="hint">
        The three best BPS in each match get 3, 2 and 1 bonus points (ties share). Until FPL confirms it, this is our
        working-out from the live BPS, so it can change while a match is on. A manager's name shows who in the league owns
        the player.
      </p>
      {started.length === 0 && <p className="notice">Bonus appears once matches start.</p>}
      {started.map(({ fixture, rows }) => (
        <article key={fixture.id} className="card">
          <header className="card-head lv-fx-head">
            <span className="lv-fx-title">{fixtureTitle(fixture, ctx)}</span>
            <span className={fixture.bonusConfirmed ? "lv-conf" : "lv-prov"}>
              {fixture.bonusConfirmed ? "Confirmed" : "Provisional"}
            </span>
          </header>
          <table className="data lv-bonus">
            <tbody>
              {rows.map((r) => {
                const player = ctx.data.players.get(r.element);
                const owner = ctx.owners.get(r.element);
                return (
                  <tr key={r.element} className={owner?.entryId === ctx.myTeam ? "mine" : undefined}>
                    <td className="lv-bonus-pts">{r.bonus > 0 ? <span className={`lv-b b${r.bonus}`}>{r.bonus}</span> : null}</td>
                    <td className="left">
                      {player?.name ?? r.element} <span className="player-meta">{player?.team}</span>
                    </td>
                    <td className="left lv-bonus-owner">
                      {owner ? (
                        <>
                          <Manager id={owner.entryId} data={ctx.data} />
                          {!owner.counts && <span className="player-meta"> bench</span>}
                        </>
                      ) : null}
                    </td>
                    <td className="num">{r.bps}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="hint lv-bps-note">Last column is BPS.</p>
        </article>
      ))}
      {waiting.length > 0 && (
        <p className="hint">
          Not started: {waiting.map((t) => fixtureTitle(t.fixture, ctx)).join(", ")}.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- fixtures

const EVENT_LABELS: [EventKey, string][] = [
  ["goals_scored", "Goals"],
  ["assists", "Assists"],
  ["own_goals", "Own goals"],
  ["penalties_missed", "Penalties missed"],
  ["penalties_saved", "Penalties saved"],
  ["yellow_cards", "Yellow cards"],
  ["red_cards", "Red cards"],
];

function FixturesView({ ctx }: { ctx: Ctx }) {
  const fixtures = [...ctx.gw.fixtures].sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "") || a.id - b.id);
  return (
    <section>
      <h2>Premier League fixtures</h2>
      <p className="hint">Who scored, assisted and got carded, with the league owner of each player in brackets.</p>
      {fixtures.map((f) => (
        <FixtureCard key={f.id} f={f} ctx={ctx} />
      ))}
    </section>
  );
}

function FixtureCard({ f, ctx }: { f: LiveFixture; ctx: Ctx }) {
  const h = ctx.clubs.get(f.teamH)?.short;
  const a = ctx.clubs.get(f.teamA)?.short;
  const status = f.finishedProvisional ? "FT" : f.started ? `${f.minutes}'` : f.kickoff ? formatKickoff(f.kickoff, true) : "TBC";
  return (
    <article className="card lv-fx">
      <div className="lv-fx-row">
        <span className="lv-fx-team">{h}</span>
        <span className="lv-fx-score">{f.started ? `${f.scoreH ?? 0} – ${f.scoreA ?? 0}` : "v"}</span>
        <span className="lv-fx-team right">{a}</span>
        <span className="lv-fx-state muted">{status}</span>
      </div>
      {EVENT_LABELS.map(([key, label]) => {
        const list = f.events[key];
        if (!list || list.length === 0) return null;
        return (
          <p key={key} className="lv-events">
            <span className="lv-events-label">{label}</span>{" "}
            {list.map((e, i) => {
              const player = ctx.data.players.get(e.element);
              const owner = ctx.owners.get(e.element);
              return (
                <span key={`${e.element}-${i}`} className="lv-event">
                  {player?.name ?? e.element}
                  {e.value > 1 && ` ×${e.value}`}
                  {owner && (
                    <span className={owner.entryId === ctx.myTeam ? "player-meta mine-name" : "player-meta"}>
                      {" "}
                      ({ctx.data.labels.get(owner.entryId)})
                    </span>
                  )}
                  {i < list.length - 1 && ", "}
                </span>
              );
            })}
          </p>
        );
      })}
    </article>
  );
}

// ---------------------------------------------------------------- helpers

function fixtureTitle(f: LiveFixture, ctx: Ctx): string {
  const h = ctx.clubs.get(f.teamH)?.short ?? "?";
  const a = ctx.clubs.get(f.teamA)?.short ?? "?";
  if (!f.started) return `${h} v ${a} (${f.kickoff ? formatKickoff(f.kickoff, true) : "TBC"})`;
  return `${h} ${f.scoreH ?? 0} - ${f.scoreA ?? 0} ${a}${f.finishedProvisional ? " · FT" : ` · ${f.minutes}'`}`;
}

function firstKickoff(gw: LiveGameweek): string | null {
  return gw.fixtures.map((f) => f.kickoff).filter((k): k is string => !!k).sort()[0] ?? null;
}

function formatKickoff(iso: string, short = false): string {
  const d = new Date(iso);
  return d
    .toLocaleString(
      "en-GB",
      short
        ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
        : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
    )
    .replace(/ /g, "\u00a0");
}
