import { useMemo, useState } from "react";
import { draftGrades, draftOnlyTable, hindsightRedraft, pickReports, squadOrigins, type Origins, type PickReport } from "../../shared/draft";
import { computeStandings } from "../../shared/standings";
import { Manager, PlayerName, Pts, ShowFilter, useShownManager, SubNav } from "./bits";
import type { LeagueData } from "./data";

export const DRAFT_VIEWS = [
  { id: "grades", label: "Grades" },
  { id: "picks", label: "Steals" },
  { id: "no-moves", label: "No moves" },
  { id: "origins", label: "Points" },
  { id: "redraft", label: "Redraft" },
] as const;
export type DraftView = (typeof DRAFT_VIEWS)[number]["id"];

export function DraftPage({ data, myTeam, view }: { data: LeagueData; myTeam: number | null; view: DraftView }) {
  const reports = useMemo(() => pickReports(data.draft, data.seasons), [data]);
  const grades = useMemo(() => draftGrades(reports), [reports]);
  const positions = useMemo(() => new Map(data.playerList.map((p) => [p.id, p.position])), [data]);
  const draftTable = useMemo(
    () => draftOnlyTable(data.league, data.draft, data.seasons, positions, data.rules),
    [data, positions],
  );
  const realTable = useMemo(() => computeStandings(data.league), [data]);
  const origins = useMemo(
    () =>
      squadOrigins([...data.entries.keys()], data.seasons, {
        transactions: data.transactions,
        trades: data.trades,
        draft: data.draft,
      }),
    [data],
  );
  const redraft = useMemo(() => hindsightRedraft(data.draft, data.seasons, data.playerList, data.rules), [data]);

  return (
    <>
      <SubNav page="draft" views={DRAFT_VIEWS} current={view} label="Draft sections" />
      <p className="hint">
        {data.seasons.lastEvent === 0
          ? "No gameweeks have been played yet, so all of this starts at zero until gameweek 1."
          : `Everything here uses points from ${data.seasons.lastEvent === 1 ? "the first gameweek" : `the ${data.seasons.lastEvent} gameweeks`} played so far${data.inProgress ? `, including gameweek ${data.game.current_event} as it stands` : ""}, so early on it can swing a lot from week to week.`}
      </p>
      {view === "grades" && <Grades grades={grades} data={data} myTeam={myTeam} />}
      {view === "picks" && <StealsAndBusts reports={reports} data={data} myTeam={myTeam} />}
      {view === "no-moves" && <DraftOnlyTable rows={draftTable} real={realTable} data={data} myTeam={myTeam} />}
      {view === "origins" && <SquadOrigins origins={origins} data={data} myTeam={myTeam} />}
      {view === "redraft" && <Redraft redraft={redraft} data={data} myTeam={myTeam} />}
    </>
  );
}

// ---------------------------------------------------------------- grades

function Grades({ grades, data, myTeam }: { grades: ReturnType<typeof draftGrades>; data: LeagueData; myTeam: number | null }) {
  return (
    <section>
      <h2>Draft grades</h2>
      <p className="hint">
        How every manager's 15 picks have done this season, whoever owns them now. "Vs slot" compares where each pick
        was taken with where his points rank among all 210 picks: +10 means picks are doing 10 places better than where
        they went, on average.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="left">Manager</th>
              <th className="num">Pts</th>
              <th className="num">Vs slot</th>
              <th className="num hide-narrow">Kept</th>
              <th className="left hide-narrow">Best pick</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g.entryId} className={g.entryId === myTeam ? "mine" : undefined}>
                <td className="left">
                  <Manager id={g.entryId} data={data} />
                </td>
                <td className="num strong">{g.points}</td>
                <td className="num">
                  <Pts n={Math.round(g.value / 15)} signed />
                </td>
                <td className="num hide-narrow">
                  {g.kept}
                  <span className="of">/15</span>
                </td>
                <td className="left hide-narrow">
                  <PlayerName id={g.best.element} data={data} detail={false} />{" "}
                  <span className="player-meta">#{g.best.index}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- steals & busts

function StealsAndBusts({ reports, data, myTeam }: { reports: PickReport[]; data: LeagueData; myTeam: number | null }) {
  const [who, setWho] = useShownManager();
  const pool = who === null ? reports : reports.filter((r) => r.entryId === who);
  const steals = [...pool].sort((a, b) => b.value - a.value).slice(0, 5);
  const busts = [...pool].sort((a, b) => a.value - b.value).slice(0, 5);
  return (
    <section>
      <div className="section-head">
        <h2>Steals and busts</h2>
        <ShowFilter data={data} value={who} onChange={setWho} myTeam={myTeam} />
      </div>
      <p className="hint">Picks doing far better, or far worse, than where they were taken.</p>
      <div className="two-col">
        <PickList title="Steals" picks={steals} data={data} myTeam={myTeam} />
        <PickList title="Busts" picks={busts} data={data} myTeam={myTeam} />
      </div>
    </section>
  );
}

function PickList({ title, picks, data, myTeam }: { title: string; picks: PickReport[]; data: LeagueData; myTeam: number | null }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      <ol className="plain pick-list">
        {picks.map((p) => (
          <li key={p.index} className={p.entryId === myTeam ? "is-mine" : undefined}>
            <div>
              <PlayerName id={p.element} data={data} />
            </div>
            <div className="note">
              Pick {p.index} by <Manager id={p.entryId} data={data} />
              {p.wasAuto && " (auto)"} · {p.points} pts, {ordinal(p.pointsRank)} best
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- draft-only table

function DraftOnlyTable({
  rows,
  real,
  data,
  myTeam,
}: {
  rows: ReturnType<typeof draftOnlyTable>;
  real: ReturnType<typeof computeStandings>;
  data: LeagueData;
  myTeam: number | null;
}) {
  return (
    <section>
      <h2>If nobody had made a move</h2>
      <p className="hint">
        Where each manager would be if they'd kept their 15 draft picks all season and never made a waiver claim or
        trade, next to where they actually are. "Moves" is how many places better or worse off their waivers and trades have left them.
      </p>
      <p className="hint">
        Nobody picked these draft-only teams week to week, so each one fields its best possible XI every gameweek. That
        makes the scores higher than real ones, but it's the same for everyone.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="num">
                Draft
                <br />
                only
              </th>
              <th className="left">Manager</th>
              <th className="num hide-narrow">W-D-L</th>
              <th className="num hide-narrow">Pts</th>
              <th className="num">Actual</th>
              <th className="left">Moves</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const actual = real.find((x) => x.leagueEntryId === r.leagueEntryId)!.rank;
              const better = r.rank - actual; // positive: higher in the real table
              return (
                <tr key={r.leagueEntryId} className={r.entryId === myTeam ? "mine" : undefined}>
                  <td className="num rank">{ordinal(r.rank)}</td>
                  <td className="left">
                    <Manager id={r.entryId} data={data} />
                  </td>
                  <td className="num hide-narrow">
                    {r.won}-{r.drawn}-{r.lost}
                  </td>
                  <td className="num hide-narrow">{r.total}</td>
                  <td className="num strong">{ordinal(actual)}</td>
                  <td className="left">
                    {better === 0 ? (
                      <span className="muted nowrap">No change</span>
                    ) : (
                      <span className={`nowrap ${better > 0 ? "pts-pos" : "pts-neg"}`}>
                        {better > 0 ? "▲" : "▼"} {Math.abs(better)} {better > 0 ? "better" : "worse"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- squad origins

const ORIGINS = [
  { key: "draft", label: "Draft" },
  { key: "waiver", label: "Waivers" },
  { key: "free agent", label: "Free agents" },
  { key: "trade", label: "Trades" },
] as const;

function SquadOrigins({ origins, data, myTeam }: { origins: Origins[]; data: LeagueData; myTeam: number | null }) {
  const total = (o: Origins) => ORIGINS.reduce((s, { key }) => s + o.points[key], 0);
  const sorted = [...origins].sort((a, b) => b.points.draft / (total(b) || 1) - a.points.draft / (total(a) || 1));
  return (
    <section>
      <h2>Where the points come from</h2>
      <p className="hint">
        Each manager's points this season, split by how they got the player who scored them. The numbers underneath are
        how many of their current 15 came each way.
      </p>
      <div className="legend">
        {ORIGINS.map(({ key, label }, i) => (
          <span key={key} className="legend-item">
            <span className={`swatch s${i + 1}`} />
            {label}
          </span>
        ))}
      </div>
      <div className="card origins">
        {sorted.map((o) => {
          const sum = total(o) || 1;
          return (
            <div key={o.entryId} className={o.entryId === myTeam ? "origin-row is-mine" : "origin-row"}>
              <div className="origin-name">
                <Manager id={o.entryId} data={data} />
                <span className="player-meta"> {total(o)} pts</span>
              </div>
              <div className="bar" role="img" aria-label={ORIGINS.map(({ key, label }) => `${label} ${o.points[key]}`).join(", ")}>
                {ORIGINS.map(({ key, label }, i) =>
                  o.points[key] > 0 ? (
                    <span
                      key={key}
                      className={`seg s${i + 1}`}
                      style={{ flexGrow: o.points[key] / sum }}
                      title={`${label}: ${o.points[key]} pts (${Math.round((o.points[key] / sum) * 100)}%)`}
                    />
                  ) : null,
                )}
              </div>
              <div className="note origin-counts">
                {ORIGINS.map(({ key, label }) => `${label} ${o.points[key]} pts / ${o.squad[key]} now`).join(" · ")}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- redraft

function Redraft({ redraft, data, myTeam }: { redraft: ReturnType<typeof hindsightRedraft>; data: LeagueData; myTeam: number | null }) {
  const [rounds, setRounds] = useState(2);
  const [who, setWho] = useShownManager();
  const shown = who !== null ? redraft.filter((r) => r.entryId === who) : redraft.filter((r) => r.round <= rounds);
  return (
    <section>
      <div className="section-head">
        <h2>Hindsight redraft</h2>
        <ShowFilter data={data} value={who} onChange={setWho} myTeam={myTeam} />
      </div>
      <p className="hint">
        The draft run again in the same order, with everyone taking the best scorer still available who fits their squad
        (2 GKP, 5 DEF, 5 MID, 3 FWD). Anyone in the game counts, including players nobody drafted.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="num">#</th>
              <th className="left">Manager</th>
              <th className="left">Took</th>
              <th className="left">Should have taken</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.index} className={r.entryId === myTeam ? "mine" : undefined}>
                <td className="num rank">{r.index}</td>
                <td className="left">
                  <Manager id={r.entryId} data={data} />
                </td>
                <td className="left">
                  <PlayerName id={r.actual} data={data} detail={false} />
                </td>
                <td className="left">
                  <PlayerName id={r.hindsight} data={data} detail={false} />{" "}
                  <span className="player-meta">{r.hindsightPoints}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {who === null && rounds < 15 && (
        <button className="link more" onClick={() => setRounds((n) => Math.min(15, n + 3))}>
          Show more rounds
        </button>
      )}
    </section>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
