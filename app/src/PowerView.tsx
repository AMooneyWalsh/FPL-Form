import { useMemo } from "react";
import { powerRankings, RECENT, WEIGHTS, type PowerRow } from "../../shared/power";
import { lastFinishedEvent } from "../../shared/results";
import { Explainer, Manager, RowNo, ScrollTable } from "./bits";
import type { LeagueData } from "./data";
import { ordinal } from "./format";

/** League > Power (#/league/power): who's actually strong right now, whatever the table says. */
export function PowerView({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const rows = useMemo(
    () =>
      powerRankings({
        details: data.league,
        seasons: data.seasons,
        positions: new Map(data.playerList.map((p) => [p.id, p.position])),
        rules: data.rules,
        owners: data.owners,
      }),
    [data],
  );
  if (rows.length === 0) return <p className="notice">Power rankings start once gameweek 1 is finished.</p>;

  const last = lastFinishedEvent(data.league);
  const name = (r: PowerRow) => data.labels.get(r.entryId) ?? "Someone";
  /** "Joe", "Joe and Daire", "Joe, Daire and Conor" */
  const names = (list: PowerRow[]) => {
    const all = list.map(name);
    return all.length < 2 ? all.join("") : `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`;
  };
  const moved = (r: PowerRow) => (r.previousRank === null ? 0 : r.previousRank - r.rank);
  const up = Math.max(...rows.map(moved));
  const down = Math.min(...rows.map(moved));
  // Where the table and the rankings disagree most, each way.
  const gap = (r: PowerRow) => r.tableRank - r.rank;
  const underrated = [...rows].sort((a, b) => gap(b) - gap(a))[0];
  const flattered = [...rows].sort((a, b) => gap(a) - gap(b))[0];
  const there = (r: PowerRow) => `${name(r)} (${ordinal(r.tableRank)} there, ${ordinal(r.rank)} here)`;
  const verdict = [
    gap(underrated) > 0 && `hardest on ${there(underrated)}`,
    gap(flattered) < 0 && `kindest to ${there(flattered)}`,
  ].filter(Boolean);
  const pct = (w: number) => `${Math.round(w * 100)}%`;

  return (
    <section>
      <h2>Power rankings</h2>
      <p className="hint">After GW{last}. Who's actually strong right now, fixture luck taken out.</p>
      <Explainer>
        <p>
          Four things, each measured by how far above or below the league average it is (so no one number drowns out
          the rest), then weighted and added up.
        </p>
        <p>
          <strong>Last {RECENT}</strong> ({pct(WEIGHTS.recent)}): average score over the last {RECENT} gameweeks.
        </p>
        <p>
          <strong>Avg</strong> ({pct(WEIGHTS.season)}): average score all season.
        </p>
        <p>
          <strong>All-play</strong> ({pct(WEIGHTS.allPlay)}): every week played against all 13 others at once, as
          won-drawn-lost. Nobody gets to blame the fixture list for this one.
        </p>
        <p>
          <strong>Squad</strong> ({pct(WEIGHTS.squad)}): what the best starting XI from the squad they have now would
          have scored, on average, over the last {RECENT} gameweeks, whoever owned the players then. So a trade or a
          signing counts straight away.
        </p>
        <p>
          Arrows show places moved since the ranking after GW{last - 1}. "Table" is where the league table has them.
        </p>
      </Explainer>

      {last > 1 && (up > 0 || down < 0) && (
        <div className="verdicts">
          <div className="card verdict-card">
            <div className="hint">Flying</div>
            <div className="verdict-big">{up > 0 ? names(rows.filter((r) => moved(r) === up)) : "Nobody"}</div>
            {up > 0 && (
              <div className="pts-pos">
                up {up} {up === 1 ? "place" : "places"}
              </div>
            )}
          </div>
          <div className="card verdict-card">
            <div className="hint">Falling off</div>
            <div className="verdict-big">{down < 0 ? names(rows.filter((r) => moved(r) === down)) : "Nobody"}</div>
            {down < 0 && (
              <div className="pts-neg">
                down {-down} {down === -1 ? "place" : "places"}
              </div>
            )}
          </div>
        </div>
      )}

      <ScrollTable>
        <table className="data standings power">
          <thead>
            <tr>
              <th className="left">Manager</th>
              <th className="num">Table</th>
              <th className="num">Last {RECENT}</th>
              <th className="num">Avg</th>
              <th className="num">All-play</th>
              <th className="num">Squad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entryId} className={r.entryId === myTeam ? "mine" : undefined}>
                <td className="left">
                  <RowNo>
                    {r.rank}
                    {r.previousRank !== null && <Moved n={moved(r)} />}
                  </RowNo>
                  <Manager id={r.entryId} data={data} />
                </td>
                <td className="num">{ordinal(r.tableRank)}</td>
                <td className="num strong">{round1(r.recent)}</td>
                <td className="num">{round1(r.season)}</td>
                <td className="num">
                  {r.allPlay.won}-{r.allPlay.drawn}-{r.allPlay.lost}
                </td>
                <td className="num">{round1(r.squad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
      {verdict.length > 0 && <p className="hint power-note">The table is {verdict.join(" and ")}.</p>}
    </section>
  );
}

/** ▲2 / ▼1 / – under the rank, as on the Live table. */
function Moved({ n }: { n: number }) {
  return (
    <span className={`move ${n > 0 ? "up" : n < 0 ? "down" : "same"}`} aria-label={n > 0 ? `up ${n}` : n < 0 ? `down ${-n}` : "no change"}>
      {n > 0 ? `▲${n}` : n < 0 ? `▼${-n}` : "–"}
    </span>
  );
}

function round1(n: number): string {
  return n.toFixed(1);
}
