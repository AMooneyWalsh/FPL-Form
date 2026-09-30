import { useEffect, useState } from "react";
import { useLeagueData } from "./data";
import { DraftPage } from "./DraftPage";
import { timeAgo } from "./format";
import { useMyTeam } from "./myTeam";
import { PlayersPage } from "./PlayersPage";
import { LEAGUE_VIEWS, LeaguePage, type LeagueView } from "./LeaguePage";
import { LivePage } from "./LivePage";
import { TradesPage } from "./TradesPage";
import { WaiversPage } from "./WaiversPage";

const PAGES = [
  { id: "trades", label: "Trades" },
  { id: "waivers", label: "Waivers" },
  { id: "draft", label: "Draft" },
  { id: "players", label: "Players" },
  { id: "league", label: "League" },
  { id: "live", label: "Live" },
] as const;
type PageId = (typeof PAGES)[number]["id"];
interface Route {
  page: PageId;
  view: LeagueView;
}

function routeFromHash(): Route {
  const [first, second] = window.location.hash.replace(/^#\/?/, "").split("/");
  // Old links to #/table still work.
  if (first === "table") return { page: "league", view: "table" };
  const page = PAGES.find((p) => p.id === first)?.id ?? "trades";
  const view = LEAGUE_VIEWS.find((v) => v.id === second)?.id ?? "table";
  return { page, view };
}

function useRoute(): Route {
  const [page, setPage] = useState<Route>(routeFromHash);
  useEffect(() => {
    const onChange = () => {
      setPage(routeFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return page;
}

export function App() {
  const data = useLeagueData();
  const { page, view } = useRoute();
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
            {page === "draft" && <DraftPage data={ready} myTeam={myTeam} />}
            {page === "players" && <PlayersPage data={ready} myTeam={myTeam} />}
            {page === "league" && <LeaguePage data={ready} myTeam={myTeam} view={view} />}
            {page === "live" && <LivePage data={ready} myTeam={myTeam} />}
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
