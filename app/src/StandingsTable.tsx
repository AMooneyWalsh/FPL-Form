import type { StandingRow } from "../../shared/standings";

export function StandingsTable({ rows, myTeam }: { rows: StandingRow[]; myTeam: number | null }) {
  return (
    <div className="table-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th className="num">#</th>
            <th className="left">Team</th>
            <th className="num">W</th>
            <th className="num">D</th>
            <th className="num">L</th>
            <th className="num hide-narrow">+/-</th>
            <th className="num">Pts</th>
            <th className="left hide-narrow">Form</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff = r.pointsFor - r.pointsAgainst;
            return (
              <tr key={r.leagueEntryId} className={r.entryId === myTeam ? "mine" : undefined}>
                <td className="num rank">{r.rank}</td>
                <td className="left">
                  <a className="team" href={`#/manager/${r.entryId}`}>
                    {r.teamName}
                  </a>
                  <div className="manager">
                    {r.managerName} · {r.pointsFor} scored
                  </div>
                </td>
                <td className="num">{r.won}</td>
                <td className="num">{r.drawn}</td>
                <td className="num">{r.lost}</td>
                <td className="num hide-narrow">{diff > 0 ? `+${diff}` : diff}</td>
                <td className="num pts">{r.total}</td>
                <td className="left hide-narrow">
                  <span className="form">
                    {r.results.slice(-5).map((res, i) => (
                      <span key={i} className={`chip ${res}`}>
                        {res}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
