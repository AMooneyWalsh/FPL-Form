import { Fragment, useMemo, useState } from "react";
import {
  bonusTable,
  defconTable,
  fixtureImpacts,
  gamesOf,
  leagueOwners,
  liveMatches,
  liveTable,
  topPerformers,
  type DefconRow,
  type Impact,
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
import type { Envelope, Player, TeamSheets } from "../../shared/types";
import { useApi } from "./api";
import { InjuryFlag, Manager, SubNav } from "./bits";
import type { LeagueData } from "./data";
import { StandingsTable } from "./StandingsTable";

export const LIVE_VIEWS = [
  { id: "matches", label: "Matches" },
  { id: "table", label: "Table" },
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
  /** Official team sheets, once out (about an hour before each kick-off). */
  sheets: TeamSheets | null;
}

export function LivePage({ data, myTeam, view }: { data: LeagueData; myTeam: number | null; view: LiveView }) {
  const current = data.game.current_event;
  const hasNext = data.league.matches.some((m) => m.event === current + 1);
  const last = hasNext ? current + 1 : current;
  // null = follow FPL's current gameweek, which moves on at each deadline.
  const [picked, setPicked] = useState<number | null>(null);
  const event = picked !== null && picked >= 1 && picked <= last ? picked : current;
  const isCurrent = event === current;
  const live = useApi<Envelope<LiveGameweek>>(event >= 1 ? `/api/live/${event}` : null, isCurrent ? 30 : 3600);
  const showNext = isCurrent && data.game.current_event_finished && hasNext;
  // Team sheets only matter for matches still to start: this week's or next.
  const wantSheets = event > current || (isCurrent && !data.game.current_event_finished);
  const sheets = useApi<Envelope<TeamSheets>>(wantSheets ? `/api/teamsheets/${event}` : null, 60);
  const next = useApi<Envelope<LiveGameweek>>(showNext ? `/api/live/${event + 1}` : null, 3600);

  if (current < 1) return <p className="notice">The season hasn't started yet. Live scores appear here from gameweek 1.</p>;
  return (
    <>
      <SubNav page="live" views={LIVE_VIEWS} current={view} label="Live sections" />
      <GameweekPicker event={event} current={current} last={last} onPick={(n) => setPicked(n === current ? null : n)} />
      {live.status === "loading" && <p className="notice">Loading gameweek {event}…</p>}
      {live.status === "error" && <p className="notice error">Couldn't load the live scores. {live.message}</p>}
      {live.status === "ready" && (
        <LiveView
          gw={live.value.data}
          next={showNext && next.status === "ready" ? next.value.data : null}
          sheets={wantSheets && sheets.status === "ready" ? sheets.value.data : null}
          data={data}
          myTeam={myTeam}
          view={view}
        />
      )}
    </>
  );
}

/** "‹ Gameweek 6 ›": step back through earlier weeks or on to the next one. */
function GameweekPicker({
  event,
  current,
  last,
  onPick,
}: {
  event: number;
  current: number;
  last: number;
  onPick: (n: number) => void;
}) {
  return (
    <div className="gw-picker">
      <button
        type="button"
        className="gw-step"
        onClick={() => onPick(event - 1)}
        disabled={event <= 1}
        aria-label="Previous gameweek"
      >
        ‹
      </button>
      <div className="gw-picker-mid">
        <strong>Gameweek {event}</strong>
        {event !== current && (
          <button type="button" className="link" onClick={() => onPick(current)}>
            Back to gameweek {current}
          </button>
        )}
      </div>
      <button
        type="button"
        className="gw-step"
        onClick={() => onPick(event + 1)}
        disabled={event >= last}
        aria-label="Next gameweek"
      >
        ›
      </button>
    </div>
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
  sheets,
  data,
  myTeam,
  view,
}: {
  gw: LiveGameweek;
  next: LiveGameweek | null;
  sheets: TeamSheets | null;
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
      sheets,
    };
  }, [data, gw, myTeam, sheets]);

  return (
    <>
      {view === "matches" && <MatchesView ctx={ctx} next={next} />}
      {view === "table" && <TableView ctx={ctx} />}
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
          <h2>Matches</h2>
          <span className={`phase phase-${phase}`}>
            {phase === "live" ? "Live" : phase === "done" ? "Finished" : "Not started"}
          </span>
        </div>
        <p className="hint">
          {phase === "live" && `${played} of ${gw.fixtures.length} matches finished · updates every 30 seconds.`}
          {phase === "done" &&
            (gw.fixtures.every((f) => f.finished)
              ? "All matches finished and FPL has confirmed the points."
              : "All matches are over. FPL is still confirming bonus and subs, so scores may move a little.")}
          {phase === "upcoming" && firstKickoff(gw) && `First kick-off ${formatKickoff(firstKickoff(gw)!)}.`}
        </p>
        {hasLineups && (
          <p className="hint">
            <span className="lv-key">
              <Dot status="playing" /> playing now <Dot status="played" /> played <Dot status="to-play" /> to play
            </span>{" "}
            · tap a match for lineups, a player for his points.
          </p>
        )}
        {ctx.sheets && ctx.sheets.announced.length > 0 && (
          <p className="hint">
            Team news is in for some matches: <span className="ts ts-start">Starting</span>{" "}
            <span className="ts ts-bench">Bench</span> <span className="ts ts-out">Not in squad</span> until kick-off.
          </p>
        )}
        {!hasLineups && (
          <p className="notice">
            Starting XIs appear once the deadline passes. Until then, tap a match to see both squads as they stand now,
            after this week's waivers and trades.
          </p>
        )}
        {ordered.map((m) => (
          <MatchCard key={`${m.homeEntry}-${m.awayEntry}`} m={m} ctx={ctx} startOpen={mine(m)} />
        ))}
      </section>

      {phase !== "upcoming" && (
        <a className="card link-card" href="#/live/table">
          <strong>{phase === "live" ? "Live table" : `Table after gameweek ${gw.event}`}</strong>
          <span className="muted">
            {phase === "live" ? "Where everyone would be if it ended now" : "With this week's places gained and lost"} →
          </span>
        </a>
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
          {/* Once it's over, W/L next to the score. While it's live the score says it all. */}
          {phase === "done" && m.home && m.away && (
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
      {open && !(m.home && m.away) && (
        // Before the deadline: the squads as they stand now (FPL only reveals who starts at the deadline).
        ctx.gw.event >= ctx.data.game.current_event ? (
          <SquadPreview home={m.homeEntry} away={m.awayEntry} ctx={ctx} />
        ) : (
          <p className="hint lv-pad">Lineups appear once the deadline passes.</p>
        )
      )}
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
      {squad && ctx.phase === "live" && <SquadSummary squad={squad} />}
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

/** "2 playing · 5 to play" under each side, so you can see who has more to come without opening the match. */
function SquadSummary({ squad }: { squad: LiveSquad }) {
  const counting = squad.players.filter((p) => p.counts);
  const playing = counting.filter((p) => p.status === "playing").length;
  const toPlay = counting.filter((p) => p.status === "to-play").length;
  if (!playing && !toPlay) return <span className="lv-summary">All played</span>;
  return (
    <span className="lv-summary">
      {playing > 0 && <span className="lv-summary-live">{playing} playing</span>}
      {playing > 0 && toPlay > 0 && " · "}
      {toPlay > 0 && `${toPlay} to play`}
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
  // A heavier line where one position group ends and the next begins (GK |
  // DEF | MID | FWD). Each side has its own, as formations differ.
  const groupEnd = (list: LivePlayer[], i: number, bench: boolean) =>
    !bench && i < list.length - 1 && list[i].position !== list[i + 1].position;
  const rows = (left: LivePlayer[], right: LivePlayer[], bench: boolean) =>
    Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [
      <Cell key={`h${i}`} p={left[i]} squad={home} bench={bench} groupEnd={groupEnd(left, i, bench)} ctx={ctx} />,
      <Cell key={`a${i}`} p={right[i]} squad={away} bench={bench} groupEnd={groupEnd(right, i, bench)} ctx={ctx} />,
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

type SheetStatus = "start" | "bench" | "out";

/**
 * Where a player is on his club's official team sheet, until his match kicks
 * off. Sheets always come out after the FPL deadline, so this only ever shows
 * on the real lineups, never on the pre-deadline squads.
 */
function sheetStatus(p: Player | undefined, ctx: Ctx): SheetStatus | null {
  if (!ctx.sheets || !p?.code) return null;
  const games = gamesOf(p.teamId, ctx.gw);
  if (games.length === 0 || games.some((f) => f.started)) return null;
  if (!ctx.sheets.announced.includes(p.team)) return null;
  return ctx.sheets.players[p.code] ?? "out";
}

const SHEET_LABELS: Record<SheetStatus, string> = { start: "Starting", bench: "Bench", out: "Not in squad" };

function SheetTag({ p, ctx }: { p: Player | undefined; ctx: Ctx }) {
  const status = sheetStatus(p, ctx);
  if (!status) return null;
  return <span className={`ts ts-${status}`}>{SHEET_LABELS[status]}</span>;
}

const POSITION_ORDER: Record<Player["position"], number> = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };

/** Both current squads by position, for before the deadline when the XIs aren't known yet. */
function SquadPreview({ home, away, ctx }: { home: number; away: number; ctx: Ctx }) {
  const squad = (entry: number) =>
    ctx.data.playerList
      .filter((p) => ctx.data.owners.get(p.id) === entry)
      .sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position] || b.totalPoints - a.totalPoints);
  const h = squad(home);
  const a = squad(away);
  if (h.length === 0 && a.length === 0) return <p className="hint lv-pad">Squads appear once the deadline passes.</p>;
  const cell = (list: Player[], i: number) => {
    const p = list[i];
    if (!p) return <div className="lv-row empty" />;
    const groupEnd = i < list.length - 1 && p.position !== list[i + 1].position;
    return (
      <div className={`lv-row ${groupEnd ? "group-end" : ""}`} role="cell">
        <div className="lv-row-main static">
          <Shirt teamId={p.teamId} gk={p.position === "GKP"} ctx={ctx} />
          <span className="lv-row-body">
            <span className="lv-row-name">
              {p.name} <InjuryFlag p={p} />
            </span>
            <FixtureLines teamId={p.teamId} ctx={ctx} />
          </span>
          <span />
        </div>
      </div>
    );
  };
  return (
    <>
      <p className="hint lv-pad lv-squad-note">Squads as they stand now. Who starts is only known at the deadline.</p>
      <div className="lv-lineups" role="table" aria-label="Squads">
        {Array.from({ length: Math.max(h.length, a.length) }, (_, i) => [
          <Fragment key={`h${i}`}>{cell(h, i)}</Fragment>,
          <Fragment key={`a${i}`}>{cell(a, i)}</Fragment>,
        ])}
      </div>
    </>
  );
}

function Cell({ p, squad, bench, groupEnd, ctx }: { p?: LivePlayer; squad: LiveSquad; bench: boolean; groupEnd: boolean; ctx: Ctx }) {
  if (!p) return <div className="lv-row empty" />;
  return <PlayerRow p={p} squad={squad} bench={bench} groupEnd={groupEnd} ctx={ctx} />;
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

/** The match minute, or "Live": FPL's Draft API often reports 0 minutes for a match under way. */
function clock(f: LiveFixture): string {
  return f.minutes > 0 ? `${f.minutes}'` : "Live";
}

/** ["NFO 0 - 1 COV", "FT"], ["BHA 1 - 0 ARS", "67'"] or ["LEE v CRY", "Sun 13:00"]: the match, then when. */
/** [match, when, under way now] per fixture. */
function fixtureLines(teamId: number, ctx: Ctx): [string, string, boolean][] {
  const games = gamesOf(teamId, ctx.gw);
  if (games.length === 0) return [["No game this week", "", false]];
  return games.map((f) => {
    const h = ctx.clubs.get(f.teamH)?.short ?? "?";
    const a = ctx.clubs.get(f.teamA)?.short ?? "?";
    if (!f.started) return [`${h} v ${a}`, f.kickoff ? formatKickoff(f.kickoff, true) : "TBC", false];
    if (f.finishedProvisional) return [`${h} ${f.scoreH ?? 0} - ${f.scoreA ?? 0} ${a}`, "FT", false];
    return [`${h} ${f.scoreH ?? 0} - ${f.scoreA ?? 0} ${a}`, clock(f), true];
  });
}

/** One line per fixture. In a narrow column it breaks cleanly between the match and the time. */
function FixtureLines({ teamId, ctx }: { teamId: number; ctx: Ctx }) {
  return (
    <>
      {fixtureLines(teamId, ctx).map(([match, when, live]) => (
        <span key={match} className="lv-row-fix">
          <span>{match}</span> {when && <span className={live ? "lv-clock" : undefined}>{when}</span>}
        </span>
      ))}
    </>
  );
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

function PlayerRow({ p, squad, bench, groupEnd, ctx }: { p: LivePlayer; squad: LiveSquad; bench: boolean; groupEnd: boolean; ctx: Ctx }) {
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
    <div className={`lv-row ${!p.counts ? (bench ? "benched" : "off") : ""} ${p.status} ${groupEnd ? "group-end" : ""}`} role="cell">
      <button className="lv-row-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Shirt teamId={p.teamId} gk={p.position === "GKP"} ctx={ctx} />
        <span className="lv-row-body">
          <span className="lv-row-name">
            {benchNo && <span className="lv-bench-no">{benchNo}</span>}
            {player?.name ?? `Player ${p.element}`}
          </span>
          <SheetTag p={player} ctx={ctx} />
          {note && <span className={`lv-note ${note.cls}`}>{note.text}</span>}
          {parts.length > 0 && <span className="lv-row-stats">{parts.join(", ")}</span>}
          <FixtureLines teamId={p.teamId} ctx={ctx} />
        </span>
        {/* A dash, not 0, for someone whose match hasn't started: he hasn't blanked yet. */}
        <span className="lv-row-pts">{p.status === "to-play" && p.points === 0 ? "–" : p.points}</span>
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

// ---------------------------------------------------------------- table

function TableView({ ctx }: { ctx: Ctx }) {
  const { gw, phase, data, myTeam } = ctx;
  const before = new Map(computeStandings(data.league, gw.event - 1).map((r) => [r.entryId, r.rank]));
  const moves = new Map(ctx.table.map((r) => [r.entryId, (before.get(r.entryId) ?? r.rank) - r.rank]));
  const week = new Map<number, { score: number; against: number }>();
  if (phase !== "upcoming") {
    for (const m of ctx.matches) {
      if (!m.home || !m.away) continue;
      week.set(m.homeEntry, { score: m.home.score, against: m.away.score });
      week.set(m.awayEntry, { score: m.away.score, against: m.home.score });
    }
  }
  return (
    <section>
      <div className="section-head">
        <h2>{phase === "upcoming" ? `Table before gameweek ${gw.event}` : phase === "live" ? "Live table" : `Table after gameweek ${gw.event}`}</h2>
        {phase === "live" && <span className="phase phase-live">Live</span>}
      </div>
      <p className="hint">
        {phase === "upcoming"
          ? "Nothing played yet. Once games start, this shows where everyone would finish if it ended there."
          : phase === "live"
            ? "Where everyone would be if every match ended now. Arrows show places gained or lost since the start of the week."
            : "Arrows show places gained or lost this week."}
      </p>
      <StandingsTable rows={ctx.table} myTeam={myTeam} live={phase === "upcoming" ? undefined : { moves, week }} />
    </section>
  );
}

const DEFAULT_DEFCON = { limit: { GKP: 0, DEF: 10, MID: 12, FWD: 12 }, points: { GKP: 0, DEF: 2, MID: 2, FWD: 2 } };

function BonusView({ ctx }: { ctx: Ctx }) {
  const table = useMemo(() => bonusTable(ctx.gw), [ctx.gw]);
  const defcon = ctx.data.rules.defcon ?? DEFAULT_DEFCON;
  const defcons = useMemo(() => {
    const info = new Map<number, PlayerInfo>(ctx.data.playerList.map((p) => [p.id, { position: p.position, teamId: p.teamId }]));
    return defconTable(ctx.gw, info, defcon.limit);
  }, [ctx.gw, ctx.data.playerList, defcon]);
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
      <p className="hint">
        Defensive contributions (DefCon): a defender gets {defcon.points.DEF} points for {defcon.limit.DEF} clearances,
        blocks, interceptions and tackles in a match; a midfielder or forward needs {defcon.limit.MID}, and ball recoveries
        count too. Each match lists who has got there and who is close.
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
          <DefconList rows={defcons.get(fixture.id) ?? []} points={defcon.points} ctx={ctx} />
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

function DefconList({ rows, points, ctx }: { rows: DefconRow[]; points: Record<Player["position"], number>; ctx: Ctx }) {
  return (
    <>
      <div className="lv-dc-head">Defensive contributions</div>
      {rows.length === 0 ? (
        <p className="hint lv-bps-note">Nobody close yet.</p>
      ) : (
        <table className="data lv-bonus">
          <tbody>
            {rows.map((r) => {
              const player = ctx.data.players.get(r.element);
              const owner = ctx.owners.get(r.element);
              return (
                <tr key={r.element} className={owner?.entryId === ctx.myTeam ? "mine" : undefined}>
                  <td className="lv-bonus-pts">
                    {r.earned ? <span className="lv-b dc">+{player ? points[player.position] : 2}</span> : null}
                  </td>
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
                  <td className={`num lv-dc-count ${r.earned ? "earned" : ""}`}>
                    {r.value}/{r.limit}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

// ---------------------------------------------------------------- fixtures


function FixturesView({ ctx }: { ctx: Ctx }) {
  const info = useMemo(
    () => new Map<number, PlayerInfo>(ctx.data.playerList.map((p) => [p.id, { position: p.position, teamId: p.teamId }])),
    [ctx.data.playerList],
  );
  const limits = (ctx.data.rules.defcon ?? DEFAULT_DEFCON).limit;
  const byKickoff = (a: LiveFixture, b: LiveFixture) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "") || a.id - b.id;
  // What's happening now first, then what's done (latest first), then what's still to come.
  const live = ctx.gw.fixtures.filter((f) => f.started && !f.finishedProvisional).sort(byKickoff);
  const done = ctx.gw.fixtures.filter((f) => f.finishedProvisional).sort((a, b) => byKickoff(b, a));
  const upcoming = ctx.gw.fixtures.filter((f) => !f.started).sort(byKickoff);
  return (
    <section>
      <h2>Premier League fixtures</h2>
      <p className="lv-legend">
        <span>
          <span className="lv-badge g">G</span> goal
        </span>
        <span>
          <span className="lv-badge a">A</span> assist
        </span>
        <span>
          <span className="lv-card y" /> <span className="lv-card r" /> card
        </span>
        <span>
          <span className="lv-badge b">B</span> bonus
        </span>
        <span>
          <span className="lv-badge dc">DC</span> DefCon
        </span>
      </p>
      {[...live, ...done].map((f) => (
        <FixtureCard key={f.id} f={f} ctx={ctx} impacts={fixtureImpacts(f, ctx.gw, info, limits)} />
      ))}
      {upcoming.length > 0 && (
        <>
          <h3 className="lv-sub">Still to play</h3>
          <div className="card lv-upcoming">
            {upcoming.map((f) => (
              <div key={f.id} className="lv-up-row">
                <span className="lv-up-teams">
                  <Shirt teamId={f.teamH} gk={false} ctx={ctx} />
                  {ctx.clubs.get(f.teamH)?.short} v {ctx.clubs.get(f.teamA)?.short}
                  <Shirt teamId={f.teamA} gk={false} ctx={ctx} />
                </span>
                <span className="lv-up-when">{f.kickoff ? formatKickoff(f.kickoff, true) : "TBC"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function FixtureCard({ f, ctx, impacts }: { f: LiveFixture; ctx: Ctx; impacts: { home: Impact[]; away: Impact[] } }) {
  const live = !f.finishedProvisional;
  const side = (teamId: number, right?: boolean) => (
    <span className={`lv-fx-side ${right ? "right" : ""}`}>
      <Shirt teamId={teamId} gk={false} ctx={ctx} />
      <span className="lv-fx-team">{ctx.clubs.get(teamId)?.short}</span>
    </span>
  );
  return (
    <article className={`card lv-fx ${live ? "is-live" : ""}`}>
      <header className="lv-fx-top">
        {side(f.teamH)}
        <span className="lv-fx-mid">
          <span className="lv-fx-score">
            {f.scoreH ?? 0} – {f.scoreA ?? 0}
          </span>
          <span className={live ? "lv-fx-state lv-clock" : "lv-fx-state"}>{live ? clock(f) : "FT"}</span>
        </span>
        {side(f.teamA, true)}
      </header>
      {(impacts.home.length > 0 || impacts.away.length > 0) && (
        <div className="lv-fx-cols">
          <ImpactList list={impacts.home} ctx={ctx} />
          <ImpactList list={impacts.away} ctx={ctx} />
        </div>
      )}
    </article>
  );
}

/** Owned players get a row each; players nobody owns share one quiet line at the bottom. */
function ImpactList({ list, ctx }: { list: Impact[]; ctx: Ctx }) {
  const owned = list.filter((i) => ctx.data.owners.get(i.element));
  const others = list.filter((i) => !ctx.data.owners.get(i.element));
  return (
    <div className="lv-imp-list">
      {owned.map((i) => {
        const owner = ctx.data.owners.get(i.element)!;
        const mine = owner === ctx.myTeam;
        return (
          <div key={i.element} className={`lv-imp ${mine ? "mine" : ""}`}>
            <span className="lv-imp-name">{ctx.data.players.get(i.element)?.name ?? i.element}</span>
            <span className="lv-imp-pts">{i.points}</span>
            <span className="lv-imp-badges">
              <Badges i={i} />
            </span>
            <span className={`lv-owner ${mine ? "mine" : ""}`}>{ctx.data.labels.get(owner)}</span>
          </div>
        );
      })}
      {others.length > 0 && (
        <p className="lv-imp-others">
          <span className="lv-imp-others-label">Unowned:</span>{" "}
          {others.map((i, n) => (
            <span key={i.element} className="lv-imp-other">
              {ctx.data.players.get(i.element)?.name ?? i.element} <Badges i={i} />
              {n < others.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function Badges({ i }: { i: Impact }) {
  const times = (n: number) => (n > 1 ? `×${n}` : "");
  return (
    <>
      {i.goals > 0 && <span className="lv-badge g">G{times(i.goals)}</span>}
      {i.assists > 0 && <span className="lv-badge a">A{times(i.assists)}</span>}
      {i.ownGoals > 0 && <span className="lv-badge bad">OG{times(i.ownGoals)}</span>}
      {i.pensSaved > 0 && <span className="lv-badge g">Pen saved</span>}
      {i.pensMissed > 0 && <span className="lv-badge bad">Pen missed</span>}
      {i.yellow > 0 && <span className="lv-card y" title="Yellow card" />}
      {i.red > 0 && <span className="lv-card r" title="Red card" />}
      {i.bonus > 0 && (
        <span className="lv-badge b" title={i.bonusProvisional ? "Provisional bonus" : "Bonus"}>
          B{i.bonus}
          {i.bonusProvisional ? "*" : ""}
        </span>
      )}
      {i.defcon && <span className="lv-badge dc">DC</span>}
    </>
  );
}

// ---------------------------------------------------------------- helpers

function fixtureTitle(f: LiveFixture, ctx: Ctx): string {
  const h = ctx.clubs.get(f.teamH)?.short ?? "?";
  const a = ctx.clubs.get(f.teamA)?.short ?? "?";
  if (!f.started) return `${h} v ${a} (${f.kickoff ? formatKickoff(f.kickoff, true) : "TBC"})`;
  return `${h} ${f.scoreH ?? 0} - ${f.scoreA ?? 0} ${a}${f.finishedProvisional ? " · FT" : ` · ${clock(f)}`}`;
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
