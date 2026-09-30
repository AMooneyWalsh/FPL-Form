import { useEffect, useState } from "react";
import { useLeagueData, type LeagueData } from "./data";
import { DraftPage } from "./DraftPage";
import { timeAgo } from "./format";
import { useMyTeam } from "./myTeam";
import { PlayersPage } from "./PlayersPage";
import { LEAGUE_VIEWS, LeaguePage } from "./LeaguePage";
import { LIVE_VIEWS, LivePage } from "./LivePage";
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
  /** The part after the page, e.g. "luck" in #/league/luck. Each page checks its own. */
  sub: string | undefined;
}

function routeFromHash(): Route {
  const [first, second] = window.location.hash.replace(/^#\/?/, "").split("/");
  // Old links to #/table still work.
  if (first === "table") return { page: "league", sub: "table" };
  const page = PAGES.find((p) => p.id === first)?.id ?? "trades";
  return { page, sub: second };
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
  const { page, sub } = useRoute();
  const ready = data.status === "ready" ? data.value : null;
  const { myTeam, decided, setMyTeam } = useMyTeam(ready ? [...ready.entries.keys()] : undefined);

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-row">
          <div>
            <h1>{ready?.league.league.name ?? "Drafty In Here"}</h1>
            {ready && <p className="sub">{headline(ready)}</p>}
          </div>
          {ready && decided && <TeamPicker data={ready} value={myTeam} onChange={setMyTeam} compact />}
        </div>
      </header>
      <nav className="tabs" aria-label="Pages">
        {PAGES.map((p) => (
          <a
            key={p.id}
            href={`#/${p.id}`}
            className={p.id === page ? "active" : undefined}
            aria-current={p.id === page ? "page" : undefined}
          >
            {p.label}
            {p.id === "live" && ready?.inProgress && <span className="live-dot" aria-label="games on" />}
          </a>
        ))}
      </nav>

      <main>
        {data.status === "loading" && <p className="notice">Loading the league…</p>}
        {data.status === "error" && (
          <div className="notice error">
            <p>Couldn't load the league. {data.message}</p>
            <button className="chip-btn" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        )}
        {ready && (
          <>
            {!decided && (
              <div className="card welcome">
                <h2>Which team is yours?</h2>
                <p className="hint">
                  Pick your team and the site will highlight you everywhere. It's only saved on this device.
                </p>
                <TeamPicker data={ready} value={null} onChange={setMyTeam} />
                <button className="link small-link" onClick={() => setMyTeam(null)}>
                  I'm just having a look
                </button>
              </div>
            )}
            {ready.stale && (
              <p className="notice warn">
                FPL isn't responding right now, so some of this is from the last saved copy ({timeAgo(ready.fetchedAt)}).
              </p>
            )}
            {ready.missingGameweeks.length > 0 && (
              <p className="notice warn">
                Couldn't load {ready.missingGameweeks.map((n) => `GW${n}`).join(", ")} just now, so some numbers leave{" "}
                {ready.missingGameweeks.length === 1 ? "it" : "them"} out. Trying again in the background.
              </p>
            )}
            {page === "trades" && <TradesPage data={ready} myTeam={myTeam} />}
            {page === "waivers" && <WaiversPage data={ready} myTeam={myTeam} />}
            {page === "draft" && <DraftPage data={ready} myTeam={myTeam} />}
            {page === "players" && <PlayersPage data={ready} myTeam={myTeam} />}
            {page === "league" && (
              <LeaguePage data={ready} myTeam={myTeam} view={LEAGUE_VIEWS.find((v) => v.id === sub)?.id ?? "table"} />
            )}
            {page === "live" && (
              <LivePage data={ready} myTeam={myTeam} view={LIVE_VIEWS.find((v) => v.id === sub)?.id ?? "matches"} />
            )}
            <footer className="footer-row">
              <span className="updated">Updated {timeAgo(ready.fetchedAt)}</span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function headline(data: LeagueData): string {
  const gw = data.game.current_event;
  if (gw < 1) return "The season hasn't started yet";
  return data.inProgress ? `Gameweek ${gw} in progress` : `After gameweek ${gw}`;
}

function TeamPicker({
  data,
  value,
  onChange,
  compact,
}: {
  data: LeagueData;
  value: number | null;
  onChange: (id: number | null) => void;
  compact?: boolean;
}) {
  return (
    <label className={compact ? "team-picker compact" : "team-picker"}>
      <span className={compact ? "sr-only" : "picker-label"}>My team</span>
      <select
        className="select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">{compact ? "Just looking" : "Choose your team…"}</option>
        {[...data.entries.values()]
          .sort((a, b) => (data.labels.get(a.entry_id) ?? "").localeCompare(data.labels.get(b.entry_id) ?? ""))
          .map((e) => (
            <option key={e.entry_id} value={e.entry_id}>
              {compact ? data.labels.get(e.entry_id) : `${data.labels.get(e.entry_id)} · ${e.entry_name}`}
            </option>
          ))}
      </select>
    </label>
  );
}
