import type { StandingRow } from "../../shared/standings";
import { RowNo, ScrollTable } from "./bits";

/** Extra columns for the Live tab: this week's score and places moved since the start of the week. */
export interface LiveExtras {
  moves: Map<number, number>;
  week: Map<number, { score: number; against: number }>;
}

/**
 * The league table. Place and team stay frozen on the left; points come next
 * so they're always on screen, then form, and the rest scrolls on a phone.
 * The Live tab's version adds this week's score before points and keeps every
 * other column, so it scrolls sideways the same way.
 */
export function StandingsTable({ rows, myTeam, live }: { rows: StandingRow[]; myTeam: number | null; live?: LiveExtras }) {
  return (
    <ScrollTable>
      <table className={live ? "data standings live" : "data standings"}>
        <thead>
          <tr>
            <th className="left">Team</th>
            {live && <th className="num">GW</th>}
            <th className="num">Pts</th>
            <th className="left form-col">Form</th>
            <th className="num">W</th>
            <th className="num">D</th>
            <th className="num">L</th>
            <th className="num">+/-</th>
            <th className="num">Scored</th>
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
                <td className="left team-cell">
                  <RowNo>
                    {r.rank}
                    {live && (
                      <span
                        className={`move ${moved > 0 ? "up" : moved < 0 ? "down" : "same"}`}
                        aria-label={moved > 0 ? `up ${moved}` : moved < 0 ? `down ${-moved}` : "no change"}
                      >
                        {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "–"}
                      </span>
                    )}
                  </RowNo>
                  <span className="team-names">
                    <a className="team" href={`#/manager/${r.entryId}`}>
                      {r.teamName}
                    </a>
                    <span className="manager">{r.managerName}</span>
                  </span>
                </td>
                {live && (
                  <td className="num gw-cell">
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
                <td className="num pts">{r.total}</td>
                <td className="left form-col">
                  <span className="form">
                    {r.results.slice(-5).map((res, i) => (
                      <span key={i} className={`chip ${res}`}>
                        {res}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="num">{r.won}</td>
                <td className="num">{r.drawn}</td>
                <td className="num">{r.lost}</td>
                <td className="num">{diff > 0 ? `+${diff}` : diff}</td>
                <td className="num">{r.pointsFor}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollTable>
  );
}
