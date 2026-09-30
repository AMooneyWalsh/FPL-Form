import { useEffect, useMemo, useState } from "react";
import { computeStandings } from "../../shared/standings";
import { useLeagueData, type LeagueData } from "./data";
import { timeAgo } from "./format";
import { useMyTeam } from "./myTeam";
import { PlayersPage } from "./PlayersPage";
import { StandingsTable } from "./StandingsTable";
import { TradesPage } from "./TradesPage";
import { WaiversPage } from "./WaiversPage";

const PAGES = [
  { id: "trades", label: "Trades" },
  { id: "waivers", label: "Waivers" },
  { id: "players", label: "Players" },
  { id: "table", label: "Table" },
] as const;
type PageId = (typeof PAGES)[number]["id"];

function pageFromHash(): PageId {
  const id = window.location.hash.replace(/^#\/?/, "");
  return PAGES.find((p) => p.id === id)?.id ?? "trades";
}

function usePage(): PageId {
  const [page, setPage] = useState<PageId>(pageFromHash);
  useEffect(() => {
    const onChange = () => {
      setPage(pageFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return page;
}

export function App() {
  const data = useLeagueData();
  const page = usePage();
  const ready = data.status === "ready" ? data.value : null;
  const [myTeam, setMyTeam] = useMyTeam(ready?.config.defaultEntryId);

  return (
    <div className="page">
      <header className="masthead">
        <h1>{ready?.league.league.name ?? "Drafty In Here"}</h1>
        {ready && <p className="sub">After gameweek {ready.seasons.lastEvent}</p>}
      </header>
      <nav className="tabs">
        {PAGES.map((p) => (
          <a key={p.id} href={`#/${p.id}`} className={p.id === page ? "active" : undefined}>
            {p.label}
          </a>
        ))}
      </nav>

      <main>
        {data.status === "loading" && <p className="notice">Loading the league…</p>}
        {data.status === "error" && (
          <p className="notice error">Couldn't load the league. {data.message} Try again in a minute.</p>
        )}
        {ready && (
          <>
            {ready.stale && (
              <p className="notice warn">
                FPL isn't responding right now, so some of this is from the last saved copy ({timeAgo(ready.fetchedAt)}).
              </p>
            )}
            {page === "trades" && <TradesPage data={ready} myTeam={myTeam} />}
            {page === "waivers" && <WaiversPage data={ready} myTeam={myTeam} />}
            {page === "players" && <PlayersPage data={ready} myTeam={myTeam} />}
            {page === "table" && <TablePage data={ready} myTeam={myTeam} />}
            <footer className="footer-row">
              <label className="picker">
                My team{" "}
                <select value={myTeam ?? ""} onChange={(e) => setMyTeam(Number(e.target.value))}>
                  {[...ready.entries.values()]
                    .sort((a, b) => a.entry_name.localeCompare(b.entry_name))
                    .map((e) => (
                      <option key={e.entry_id} value={e.entry_id}>
                        {e.entry_name} ({ready.labels.get(e.entry_id)})
                      </option>
                    ))}
                </select>
              </label>
              <span className="updated">Updated {timeAgo(ready.fetchedAt)}</span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function TablePage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const standings = useMemo(() => computeStandings(data.league), [data]);
  return (
    <section>
      <h2>League table</h2>
      <StandingsTable rows={standings} myTeam={myTeam} />
    </section>
  );
}
