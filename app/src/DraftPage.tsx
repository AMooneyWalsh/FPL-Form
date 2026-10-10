import { useMemo, useState } from "react";
import { draftGrades, draftOnlyTable, hindsightRedraft, pickReports, squadOrigins, type Origins, type PickReport } from "../../shared/draft";
import { computeStandings } from "../../shared/standings";
import { draftDay } from "../../shared/waivers";
import { Explainer, Manager, PlayerName, Pts, RowNo, ScrollTable, SectionHead, ShowFilter, SubNav, useShownManager } from "./bits";
import type { LeagueData } from "./data";

export const DRAFT_VIEWS = [
  { id: "grades", label: "Grades" },
  { id: "picks", label: "Steals & busts" },
  { id: "no-moves", label: "Original squads" },
  { id: "origins", label: "Point sources" },
  { id: "redraft", label: "Redraft" },
  { id: "day", label: "Draft day" },
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
          : `Points from ${data.seasons.lastEvent === 1 ? "gameweek 1" : `gameweeks 1–${data.seasons.lastEvent}`}${data.inProgress ? `, with gameweek ${data.game.current_event} as it stands` : ""}. Early on it can swing a lot.`}
      </p>
      {view === "grades" && <Grades grades={grades} data={data} myTeam={myTeam} />}
      {view === "picks" && <StealsAndBusts reports={reports} data={data} myTeam={myTeam} />}
      {view === "no-moves" && <DraftOnlyTable rows={draftTable} real={realTable} data={data} myTeam={myTeam} />}
      {view === "origins" && <SquadOrigins origins={origins} data={data} myTeam={myTeam} />}
      {view === "redraft" && <Redraft redraft={redraft} data={data} myTeam={myTeam} />}
      {view === "day" && <DraftDay data={data} myTeam={myTeam} />}
    </>
  );
}

// ---------------------------------------------------------------- grades

function Grades({ grades, data, myTeam }: { grades: ReturnType<typeof draftGrades>; data: LeagueData; myTeam: number | null }) {
  return (
    <section>
      <h2>Draft grades</h2>
      <p className="hint">How each manager's 15 draft picks have scored, whoever owns them now.</p>
      <Explainer>
        <p>
          "Vs draft spot" compares where each pick was taken with where his points rank among all 210 picks. +10 means a
          manager's picks are doing 10 places better than where they went, on average.
        </p>
      </Explainer>
      <ScrollTable>
        <table className="data">
          <thead>
            <tr>
              <th className="left">Manager</th>
              <th className="num">Pts</th>
              <th className="num">Vs draft spot</th>
              <th className="num">Kept</th>
              <th className="left">Best pick</th>
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
                <td className="num">
                  {g.kept}
                  <span className="of">/15</span>
                </td>
                <td className="left">
                  <PlayerName id={g.best.element} data={data} detail={false} />{" "}
                  <span className="player-meta">#{g.best.index}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
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
      <SectionHead title="Steals and busts">
        <ShowFilter data={data} value={who} onChange={setWho} myTeam={myTeam} />
      </SectionHead>
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
      <p className="hint">Where everyone would be if they'd kept their 15 draft picks all season.</p>
      <Explainer>
        <p>
          No waiver claims, no trades: just the original squads, next to where everyone actually is. "Moves" is how many
          places better or worse off their waivers and trades have left them.
        </p>
        <p>
          Nobody picked these squads week to week, so each one fields its best possible XI every gameweek. That makes the
          scores higher than real ones, but it's the same for everyone.
        </p>
      </Explainer>
      <ScrollTable>
        <table className="data">
          <thead>
            <tr>
              <th className="left">Draft-only place</th>
              <th className="num">Actual</th>
              <th className="left">Moves</th>
              <th className="num">W-D-L</th>
              <th className="num">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const actual = real.find((x) => x.leagueEntryId === r.leagueEntryId)!.rank;
              const better = r.rank - actual; // positive: higher in the real table
              return (
                <tr key={r.leagueEntryId} className={r.entryId === myTeam ? "mine" : undefined}>
                  <td className="left">
                    <RowNo>{ordinal(r.rank)}</RowNo>
                    <Manager id={r.entryId} data={data} />
                  </td>
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
                  <td className="num">
                    {r.won}-{r.drawn}-{r.lost}
                  </td>
                  <td className="num">{r.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollTable>
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
      <p className="hint">Each manager's points, split by how they got the player who scored them.</p>
      <Explainer>
        <p>The numbers under each bar are how many of their current 15 came each way.</p>
      </Explainer>
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
      <SectionHead title="Hindsight redraft">
        <ShowFilter data={data} value={who} onChange={setWho} myTeam={myTeam} />
      </SectionHead>
      <p className="hint">The draft run again, with everyone taking the best scorer left who fits their squad.</p>
      <Explainer>
        <p>
          Same order as the real draft. Each squad still has to be 2 GKP, 5 DEF, 5 MID and 3 FWD. Anyone in the game at
          the time counts, including players nobody drafted; late signings FPL added after the draft are left out.
        </p>
        <p>Pick one manager with "Show" to also see the best player still available at each of their real picks.</p>
      </Explainer>
      {who !== null && (
        <p className="hint">
          "Best then" is the draft with only {data.labels.get(who)} knowing what we know now. Everyone else makes
          their real picks, and at each turn {data.labels.get(who)} takes the top scorer still available who fits.
          The real picks have scored {shown.reduce((a, r) => a + r.actualPoints, 0)} points; that squad would have
          scored {shown.reduce((a, r) => a + r.bestAvailablePoints, 0)}.
        </p>
      )}
      <ScrollTable>
        <table className="data">
          <thead>
            <tr>
              <th className="left">{who === null ? "Pick" : "#"}</th>
              <th className="left">Took</th>
              {who !== null && <th className="left">Best then</th>}
              <th className="left">{who === null ? "Should have taken" : "Redraft"}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.index} className={r.entryId === myTeam ? "mine" : undefined}>
                <td className="left">
                  <RowNo>{r.index}</RowNo>
                  {who === null && <Manager id={r.entryId} data={data} />}
                </td>
                <td className="left">
                  <PlayerName id={r.actual} data={data} detail={false} />
                  {who !== null && <> <span className="player-meta">{r.actualPoints}</span></>}
                </td>
                {who !== null && (
                  <td className="left">
                    {r.bestAvailable === r.actual ? (
                      <span className="pts-pos">Spot on</span>
                    ) : (
                      <>
                        <PlayerName id={r.bestAvailable} data={data} detail={false} />{" "}
                        <span className="player-meta">{r.bestAvailablePoints}</span>
                      </>
                    )}
                  </td>
                )}
                <td className="left">
                  <PlayerName id={r.hindsight} data={data} detail={false} />{" "}
                  <span className="player-meta">{r.hindsightPoints}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
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

// ---------------------------------------------------------------- draft day

function DraftDay({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const rows = useMemo(() => draftDay(data.draft, [...data.entries.keys()]), [data]);
  const autos = rows.flatMap((r) => r.autoPicks).sort((a, b) => a.index - b.index);
  return (
    <>
      <section>
        <h2>Draft day</h2>
        <p className="hint">
          How long everyone took over their picks (the time since the pick before), slowest first, and who left FPL to
          pick for them.
        </p>
        <ScrollTable>
          <table className="data">
            <thead>
              <tr>
                <th className="left">Manager</th>
                <th className="num">Avg</th>
                <th className="left">Slowest pick</th>
                <th className="num">Auto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entryId} className={r.entryId === myTeam ? "mine" : undefined}>
                  <td className="left">
                    <Manager id={r.entryId} data={data} />
                  </td>
                  <td className="num">{duration(r.averageSeconds)}</td>
                  <td className="left">
                    {r.slowest ? (
                      <>
                        <PlayerName id={r.slowest.choice.element} data={data} detail={false} />{" "}
                        <span className="player-meta">{duration(r.slowest.seconds)}</span>
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="num strong">{r.autoPicks.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </section>
      <section>
        <h2>Auto picks</h2>
        {autos.length === 0 ? (
          <p className="notice">Everyone made all their own picks.</p>
        ) : (
          <ul className="plain facts">
            {autos.map((c) => (
              <li key={c.index} className={c.entry === myTeam ? "is-mine" : undefined}>
                Pick {c.index}: <PlayerName id={c.element} data={data} /> for <Manager id={c.entry} data={data} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m < 60 ? `${m}m ${s}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
