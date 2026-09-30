import { useMemo, useState } from "react";
import {
  fixtureLuck,
  headToHead,
  lastFinishedEvent,
  nextMeeting,
  positionsByGameweek,
  records,
  streaks,
  type LuckRow,
  type Score,
} from "../../shared/results";
import { computeStandings } from "../../shared/standings";
import { Manager, Pts } from "./bits";
import type { LeagueData } from "./data";
import { StandingsTable } from "./StandingsTable";

export const LEAGUE_VIEWS = [
  { id: "table", label: "Table" },
  { id: "form", label: "Form" },
  { id: "luck", label: "Luck" },
  { id: "h2h", label: "Head to head" },
  { id: "records", label: "Records" },
] as const;
export type LeagueView = (typeof LEAGUE_VIEWS)[number]["id"];

export function LeaguePage({ data, myTeam, view }: { data: LeagueData; myTeam: number | null; view: LeagueView }) {
  return (
    <>
      <nav className="chips" aria-label="League sections">
        {LEAGUE_VIEWS.map((v) => (
          <a key={v.id} href={`#/league/${v.id}`} className={v.id === view ? "chip-btn active" : "chip-btn"}>
            {v.label}
          </a>
        ))}
      </nav>
      {view === "table" && <TableView data={data} myTeam={myTeam} />}
      {view === "form" && <FormView data={data} myTeam={myTeam} />}
      {view === "luck" && <LuckView data={data} myTeam={myTeam} />}
      {view === "h2h" && <HeadToHeadView data={data} myTeam={myTeam} />}
      {view === "records" && <RecordsView data={data} myTeam={myTeam} />}
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
        <div className="section-head">
          <h2>Position each week</h2>
          <ManagerSelect data={data} value={compare} onChange={setCompare} placeholder="Compare with…" exclude={myTeam} />
        </div>
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
        {highlighted.map((id, k) => {
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
        Grey lines are everyone else. {myTeam !== null && <>Your team is in blue{compare !== null && ", the comparison in orange"}.</>}
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

  return (
    <>
      <section>
        <h2>Fixture luck</h2>
        <p className="hint">
          In any gameweek, scoring more than the league's median (the middle score) should normally win. "Expected wins"
          counts those weeks. Luck is actual wins minus expected: plus means jammy, minus means robbed.
        </p>
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
        <div className="table-wrap">
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
        </div>
        <p className="hint">"Avg vs" is the average score of their opponents each week.</p>
      </section>
      <section>
        <div className="section-head">
          <h2>Week by week</h2>
          <ManagerSelect data={data} value={who ?? myTeam} onChange={setWho} />
        </div>
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

// ---------------------------------------------------------------- head to head

function HeadToHeadView({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const ids = [...data.entries.keys()];
  const [a, setA] = useState<number | null>(myTeam ?? ids[0]);
  const [b, setB] = useState<number | null>(null);
  const first = a ?? ids[0];
  const second = b ?? ids.find((id) => id !== first)!;
  const h = headToHead(data.league, first, second);
  const next = nextMeeting(data.league, first, second);
  return (
    <section>
      <h2>Head to head</h2>
      <div className="h2h-pickers">
        <ManagerSelect data={data} value={first} onChange={setA} />
        <span className="muted">v</span>
        <ManagerSelect data={data} value={second} onChange={setB} exclude={first} />
      </div>
      <div className="card h2h-card">
        <div className="h2h-score">
          <span>{h.aWins}</span>
          <span className="muted">–</span>
          <span>{h.bWins}</span>
        </div>
        <div className="hint">
          {h.matches.length === 0
            ? "They haven't played each other yet."
            : `${h.matches.length} ${h.matches.length === 1 ? "meeting" : "meetings"}${h.draws ? `, ${h.draws} drawn` : ""} · points ${h.aPoints}–${h.bPoints}`}
          {next !== null && ` · next in GW${next}`}
        </div>
      </div>
      {h.matches.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="left">GW</th>
                <th className="num">{data.labels.get(first)}</th>
                <th className="num">{data.labels.get(second)}</th>
                <th className="left">Winner</th>
              </tr>
            </thead>
            <tbody>
              {h.matches.map((m) => (
                <tr key={m.event}>
                  <td className="left">GW{m.event}</td>
                  <td className="num strong">{m.score}</td>
                  <td className="num strong">{m.against}</td>
                  <td className="left">
                    {m.result === "D" ? "Draw" : data.labels.get(m.result === "W" ? first : second)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
        <div className="table-wrap">
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
        </div>
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

function ManagerSelect({
  data,
  value,
  onChange,
  placeholder,
  exclude,
}: {
  data: LeagueData;
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  exclude?: number | null;
}) {
  const options = [...data.entries.keys()]
    .filter((id) => id !== exclude)
    .sort((x, y) => (data.labels.get(x) ?? "").localeCompare(data.labels.get(y) ?? ""));
  return (
    <select
      className="select"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((id) => (
        <option key={id} value={id}>
          {data.labels.get(id)}
        </option>
      ))}
    </select>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
