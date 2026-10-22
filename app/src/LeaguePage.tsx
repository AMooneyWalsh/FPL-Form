import { useMemo, useState } from "react";
import {
  fixtureLuck,
  lastFinishedEvent,
  positionsByGameweek,
  records,
  streaks,
  type LuckRow,
  type Score,
} from "../../shared/results";
import { computeStandings } from "../../shared/standings";
import { Explainer, Manager, ManagerSelect, Pts, ScrollTable, SectionHead, SubNav } from "./bits";
import type { LeagueData } from "./data";
import { OddsView } from "./OddsPage";
import { PowerView } from "./PowerView";
import { RivalryView } from "./RivalryView";
import { StandingsTable } from "./StandingsTable";

export const LEAGUE_VIEWS = [
  { id: "table", label: "Table" },
  { id: "power", label: "Power" },
  { id: "form", label: "Form" },
  { id: "luck", label: "Luck" },
  { id: "h2h", label: "Head to head" },
  { id: "records", label: "Records" },
  { id: "odds", label: "Odds" },
] as const;
export type LeagueView = (typeof LEAGUE_VIEWS)[number]["id"];

export function LeaguePage({ data, myTeam, view }: { data: LeagueData; myTeam: number | null; view: LeagueView }) {
  return (
    <>
      <SubNav page="league" views={LEAGUE_VIEWS} current={view} label="League sections" />
      {view === "table" && <TableView data={data} myTeam={myTeam} />}
      {view === "power" && <PowerView data={data} myTeam={myTeam} />}
      {view === "form" && <FormView data={data} myTeam={myTeam} />}
      {view === "luck" && <LuckView data={data} myTeam={myTeam} />}
      {view === "h2h" && <RivalryView data={data} myTeam={myTeam} />}
      {view === "records" && <RecordsView data={data} myTeam={myTeam} />}
      {view === "odds" && <OddsView data={data} myTeam={myTeam} />}
    </>
  );
}

// ---------------------------------------------------------------- table

function TableView({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const standings = useMemo(() => computeStandings(data.league), [data]);
  const [compare, setCompare] = useState<number | null>(null);
  return (
    <>
      <section>
        <h2>League table</h2>
        <StandingsTable rows={standings} myTeam={myTeam} />
      </section>
      <section>
        <SectionHead title="Position each week">
          <ManagerSelect data={data} value={compare} onChange={setCompare} placeholder="Compare with…" exclude={myTeam} label="Compare with" />
        </SectionHead>
        <PositionChart data={data} myTeam={myTeam} compare={compare} />
      </section>
    </>
  );
}

function PositionChart({ data, myTeam, compare }: { data: LeagueData; myTeam: number | null; compare: number | null }) {
  const weeks = useMemo(() => positionsByGameweek(data.league), [data]);
  const count = data.entries.size;
  if (weeks.length < 2) return <p className="notice">The chart appears after gameweek 2.</p>;

  const W = 360;
  const H = 260;
  const pad = { l: 26, r: 84, t: 10, b: 24 };
  const x = (i: number) => pad.l + (i / (weeks.length - 1)) * (W - pad.l - pad.r);
  const y = (pos: number) => pad.t + ((pos - 1) / (count - 1)) * (H - pad.t - pad.b);
  const path = (id: number) =>
    weeks.map((w, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(w.positions.get(id) ?? count).toFixed(1)}`).join(" ");
  const highlighted = [myTeam, compare].filter((id): id is number => id !== null);
  const others = [...data.entries.keys()].filter((id) => !highlighted.includes(id));

  return (
    <div className="card chart-card">
      <svg viewBox={`0 0 ${W} ${H}`} className="position-chart" role="img" aria-label="League position after each gameweek">
        {[1, Math.ceil(count / 2), count].map((p) => (
          <g key={p}>
            <line x1={pad.l} x2={W - pad.r} y1={y(p)} y2={y(p)} className="grid" />
            <text x={pad.l - 6} y={y(p) + 4} className="axis" textAnchor="end">
              {p}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => (
          <text key={w.event} x={x(i)} y={H - 6} className="axis" textAnchor="middle">
            GW{w.event}
          </text>
        ))}
        {others.map((id) => (
          <path key={id} d={path(id)} className="line-other" />
        ))}
        {highlighted.map((id) => {
          const k = id === myTeam ? 0 : 1;
          const last = weeks.at(-1)!.positions.get(id) ?? count;
          return (
            <g key={id}>
              <path d={path(id)} className={`line-hl s-line${k + 1}`} />
              {weeks.map((w, i) => (
                <circle key={w.event} cx={x(i)} cy={y(w.positions.get(id) ?? count)} r={4} className={`dot s-dot${k + 1}`}>
                  <title>
                    {data.labels.get(id)}: {ordinal(w.positions.get(id) ?? count)} after GW{w.event}
                  </title>
                </circle>
              ))}
              <text x={x(weeks.length - 1) + 8} y={y(last) + 4} className="end-label">
                {data.labels.get(id)} {ordinal(last)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="hint chart-note">
        Grey lines are everyone else.{myTeam !== null && " Your team is in blue."}
        {compare !== null && ` ${data.labels.get(compare)} is in orange.`}
        {myTeam === null && compare === null && " Pick a manager above to follow their line."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- form

function useRange(data: LeagueData) {
  const last = lastFinishedEvent(data.league);
  const [span, setSpan] = useState(0); // 0 = all
  const from = span === 0 ? 1 : Math.max(1, last - span + 1);
  return { last, span, setSpan, from };
}

function RangePicker({ span, setSpan, last }: { span: number; setSpan: (n: number) => void; last: number }) {
  const options = [3, 5, 10].filter((n) => n < last);
  return (
    <div className="chips small" role="group" aria-label="Gameweeks">
      {options.map((n) => (
        <button key={n} className={span === n ? "chip-btn active" : "chip-btn"} onClick={() => setSpan(n)}>
          Last {n}
        </button>
      ))}
      <button className={span === 0 ? "chip-btn active" : "chip-btn"} onClick={() => setSpan(0)}>
        All
      </button>
    </div>
  );
}

function FormView({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const { last, span, setSpan, from } = useRange(data);
  const rows = useMemo(() => computeStandings(data.league, last, from), [data, last, from]);
  return (
    <section>
      <h2>Form</h2>
      <p className="hint">
        The table over just GW{from}–{last}.
      </p>
      <RangePicker span={span} setSpan={setSpan} last={last} />
      <StandingsTable rows={rows} myTeam={myTeam} />
    </section>
  );
}

// ---------------------------------------------------------------- luck

function LuckView({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const { last, span, setSpan, from } = useRange(data);
  const rows = useMemo(() => fixtureLuck(data.league, from, last), [data, from, last]);
  const [who, setWho] = useState<number | null>(null);
  const shown = rows.find((r) => r.entryId === (who ?? myTeam)) ?? rows[0];
  const best = Math.max(...rows.map((r) => r.luck));
  const worst = Math.min(...rows.map((r) => r.luck));
  const names = (luck: number) => rows.filter((r) => r.luck === luck).map((r) => data.labels.get(r.entryId)).join(", ");
  if (rows.every((r) => r.played === 0)) {
    return <p className="notice">No results yet. Fixture luck starts after gameweek 1.</p>;
  }

  return (
    <>
      <section>
        <h2>Fixture luck</h2>
        <p className="hint">Wins compared with how often you outscored the league's middle score.</p>
        <Explainer>
          <p>
            In any gameweek, scoring more than the league's median (the middle score) should normally win. "Expected
            wins" counts those weeks. Luck is actual wins minus expected: plus means jammy, minus means robbed.
          </p>
        </Explainer>
        <RangePicker span={span} setSpan={setSpan} last={last} />
        <div className="verdicts">
          <div className="card verdict-card">
            <div className="hint">Jammiest</div>
            <div className="verdict-big">{names(best)}</div>
            <div className="pts-pos">
              {best > 0 ? `+${best}` : best} {Math.abs(best) === 1 ? "win" : "wins"}
            </div>
          </div>
          <div className="card verdict-card">
            <div className="hint">Most robbed</div>
            <div className="verdict-big">{names(worst)}</div>
            <div className="pts-neg">
              {worst} {Math.abs(worst) === 1 ? "win" : "wins"}
            </div>
          </div>
        </div>
        <ScrollTable>
          <table className="data">
            <thead>
              <tr>
                <th className="left">Manager</th>
                <th className="num">Exp W</th>
                <th className="num">Won</th>
                <th className="num">Luck</th>
                <th className="num">Avg vs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entryId} className={r.entryId === myTeam ? "mine" : undefined}>
                  <td className="left">
                    <Manager id={r.entryId} data={data} />
                  </td>
                  <td className="num">{r.expectedWins}</td>
                  <td className="num">{r.wins}</td>
                  <td className="num strong">
                    <Pts n={r.luck} signed />
                  </td>
                  <td className="num">{r.played ? Math.round(r.pointsAgainst / r.played) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
        <p className="hint">"Avg vs" is the average score of their opponents each week.</p>
      </section>
      <section>
        <SectionHead title="Week by week">
          <ManagerSelect data={data} value={shown.entryId} onChange={setWho} label="Whose weeks" />
        </SectionHead>
        <WeekStrip row={shown} />
      </section>
    </>
  );
}

function WeekStrip({ row }: { row: LuckRow }) {
  return (
    <div className="weeks">
      {row.weeks.map((w) => {
        const robbed = w.aboveMedian === true && w.result === "L";
        const jammy = w.aboveMedian === false && w.result === "W";
        return (
          <div key={w.event} className={`week ${robbed ? "robbed" : jammy ? "jammy" : ""}`}>
            <div className="week-gw">GW{w.event}</div>
            <div className={`chip ${w.result}`}>{w.result}</div>
            <div className="week-score">{w.score}</div>
            <div className="week-median">median {w.median}</div>
            {robbed && <div className="week-tag">robbed</div>}
            {jammy && <div className="week-tag">jammy</div>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- records

function RecordsView({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const st = useMemo(() => streaks(data.league), [data]);
  const rec = useMemo(() => records(data.league), [data]);
  const order = useMemo(() => computeStandings(data.league).map((r) => r.entryId), [data]);
  const sorted = [...st].sort((x, y) => order.indexOf(x.entryId) - order.indexOf(y.entryId));
  return (
    <>
      <section>
        <h2>Streaks</h2>
        <ScrollTable>
          <table className="data">
            <thead>
              <tr>
                <th className="left">Manager</th>
                <th className="num">Now</th>
                <th className="num" title="Longest winning run">
                  Best W
                </th>
                <th className="num" title="Longest run without losing">
                  Unbeaten
                </th>
                <th className="num" title="Longest losing run">
                  Worst L
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.entryId} className={s.entryId === myTeam ? "mine" : undefined}>
                  <td className="left">
                    <Manager id={s.entryId} data={data} />
                  </td>
                  <td className="num">
                    {s.currentType ? (
                      <span className={`chip ${s.currentType} wide`}>
                        {s.current}
                        {s.currentType}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="num">{s.longestWin}</td>
                  <td className="num">{s.longestUnbeaten}</td>
                  <td className="num">{s.longestLoss}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </section>
      <section>
        <h2>Records</h2>
        <div className="two-col">
          <RecordList title="Highest scores" rows={rec.highest} data={data} myTeam={myTeam} show="result" />
          <RecordList title="Lowest scores" rows={rec.lowest} data={data} myTeam={myTeam} show="result" />
          <RecordList title="Biggest wins" rows={rec.biggestWins} data={data} myTeam={myTeam} show="margin" />
          <RecordList title="Lowest winning scores" rows={rec.lowestWinning} data={data} myTeam={myTeam} show="beat" />
          <RecordList title="Highest losing scores" rows={rec.highestLosing} data={data} myTeam={myTeam} show="lostTo" />
        </div>
      </section>
    </>
  );
}

function RecordList({
  title,
  rows,
  data,
  myTeam,
  show,
}: {
  title: string;
  rows: Score[];
  data: LeagueData;
  myTeam: number | null;
  show: "result" | "margin" | "beat" | "lostTo";
}) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {rows.length === 0 && <p className="hint">No results yet.</p>}
      <ol className="plain pick-list records-list">
        {rows.map((r) => (
          <li key={`${r.event}-${r.entryId}`} className={r.entryId === myTeam ? "is-mine record-row" : "record-row"}>
            <span>
              <Manager id={r.entryId} data={data} /> <span className="player-meta">GW{r.event}</span>
            </span>
            <span className="record-detail">
              <strong>{show === "margin" ? `+${r.score - r.against}` : r.score}</strong>{" "}
              <span className="player-meta">
                {show === "margin" && `${r.score}–${r.against} v ${data.labels.get(r.opponent)}`}
                {show === "result" && `${r.result === "D" ? "drew" : r.result === "W" ? "beat" : "lost to"} ${data.labels.get(r.opponent)}`}
                {show === "beat" && `beat ${data.labels.get(r.opponent)} (${r.against})`}
                {show === "lostTo" && `lost to ${data.labels.get(r.opponent)} (${r.against})`}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- bits

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
