import type { StandingRow } from "../../shared/standings";

/** Extra columns for the Live tab: this week's score and places moved since the start of the week. */
export interface LiveExtras {
  moves: Map<number, number>;
  week: Map<number, { score: number; against: number }>;
}

export function StandingsTable({ rows, myTeam, live }: { rows: StandingRow[]; myTeam: number | null; live?: LiveExtras }) {
  return (
    <div className="table-wrap">
      <table className={live ? "standings live" : "standings"}>
        <thead>
          <tr>
            <th className="num">#</th>
            <th className="left">Team</th>
            {live && <th className="num">GW</th>}
            {live ? (
              <th className="num">W-D-L</th>
            ) : (
              <>
                <th className="num">W</th>
                <th className="num">D</th>
                <th className="num">L</th>
              </>
            )}
            <th className="num hide-narrow">+/-</th>
            <th className="num">Pts</th>
            {!live && <th className="left hide-narrow">Form</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff = r.pointsFor - r.pointsAgainst;
            const moved = live?.moves.get(r.entryId) ?? 0;
            const wk = live?.week.get(r.entryId);
            const res = wk ? (wk.score > wk.against ? "W" : wk.score < wk.against ? "L" : "D") : null;
            return (
              <tr key={r.leagueEntryId} className={r.entryId === myTeam ? "mine" : undefined}>
                <td className="num rank">
                  {r.rank}
                  {live && (
                    <span
                      className={`move ${moved > 0 ? "up" : moved < 0 ? "down" : "same"}`}
                      aria-label={moved > 0 ? `up ${moved}` : moved < 0 ? `down ${-moved}` : "no change"}
                    >
                      {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "–"}
                    </span>
                  )}
                </td>
                <td className="left">
                  <a className="team" href={`#/manager/${r.entryId}`}>
                    {r.teamName}
                  </a>
                  <div className="manager">
                    {r.managerName} · {r.pointsFor} scored
                  </div>
                </td>
                {live && (
                  <td className="num week">
                    {wk && res ? (
                      <>
                        <span className={`chip ${res}`}>{res}</span>
                        <span className="week-score">
                          {wk.score}-{wk.against}
                        </span>
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                )}
                {live ? (
                  <td className="num rec">
                    {r.won}-{r.drawn}-{r.lost}
                  </td>
                ) : (
                  <>
                    <td className="num">{r.won}</td>
                    <td className="num">{r.drawn}</td>
                    <td className="num">{r.lost}</td>
                  </>
                )}
                <td className="num hide-narrow">{diff > 0 ? `+${diff}` : diff}</td>
                <td className="num pts">{r.total}</td>
                {!live && (
                  <td className="left hide-narrow">
                    <span className="form">
                      {r.results.slice(-5).map((res, i) => (
                        <span key={i} className={`chip ${res}`}>
                          {res}
                        </span>
                      ))}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
