import { useMemo } from "react";
import { computeStandings } from "../../shared/standings";
import type { Envelope, LeagueDetails, SiteConfig } from "../../shared/types";
import { useApi } from "./api";
import { timeAgo } from "./format";
import { useMyTeam } from "./myTeam";
import { StandingsTable } from "./StandingsTable";

export function App() {
  const config = useApi<SiteConfig>("/api/config", 3600);
  const league = useApi<Envelope<LeagueDetails>>("/api/league");
  const [myTeam, setMyTeam] = useMyTeam(config.status === "ready" ? config.value.defaultEntryId : undefined);

  const standings = useMemo(
    () => (league.status === "ready" ? computeStandings(league.value.data) : []),
    [league],
  );
  const lastGw = league.status === "ready"
    ? Math.max(0, ...league.value.data.matches.filter((m) => m.finished).map((m) => m.event))
    : 0;

  return (
    <div className="page">
      <header className="masthead">
        <h1>{league.status === "ready" ? league.value.data.league.name : "Drafty In Here"}</h1>
        {lastGw > 0 && <p className="sub">Table after gameweek {lastGw}</p>}
      </header>

      <main>
        {league.status === "loading" && <p className="notice">Loading the league…</p>}
        {league.status === "error" && (
          <p className="notice error">Couldn't load the league. {league.message} Try again in a minute.</p>
        )}
        {league.status === "ready" && (
          <>
            {league.value.stale && (
              <p className="notice warn">
                FPL isn't responding right now, so this is the last saved copy from {timeAgo(league.value.fetchedAt)}.
              </p>
            )}
            <StandingsTable rows={standings} myTeam={myTeam} />
            <div className="footer-row">
              <label className="picker">
                My team{" "}
                <select value={myTeam ?? ""} onChange={(e) => setMyTeam(Number(e.target.value))}>
                  {[...league.value.data.league_entries]
                    .sort((a, b) => a.entry_name.localeCompare(b.entry_name))
                    .map((e) => (
                      <option key={e.entry_id} value={e.entry_id}>
                        {e.entry_name} ({e.player_first_name})
                      </option>
                    ))}
                </select>
              </label>
              <span className="updated">Updated {timeAgo(league.value.fetchedAt)}</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
