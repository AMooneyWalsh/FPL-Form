import { useEffect, useState } from "react";
import { countdown, upcomingDeadlines, type DeadlineKind } from "../../shared/deadlines";
import { useLeagueData, type LeagueData } from "./data";
import { DRAFT_VIEWS, DraftPage } from "./DraftPage";
import { timeAgo } from "./format";
import { useMyTeam } from "./myTeam";
import { LEAGUE_VIEWS, LeaguePage } from "./LeaguePage";
import { LIVE_VIEWS, LivePage } from "./LivePage";
import { ManagerPage } from "./ManagerPage";
import { SearchButton } from "./Search";
import { PlayerPage } from "./PlayersPage";
import { MOVES_VIEWS, MovesPage } from "./MovesPage";

const PAGES = [
  { id: "live", label: "Live" },
  { id: "league", label: "League" },
  { id: "moves", label: "Moves" },
  { id: "draft", label: "Draft" },
] as const;
type PageId = (typeof PAGES)[number]["id"];
/** Pages without a tab of their own, reached by tapping a name. */
type DetailId = "player" | "manager";
interface Route {
  /** undefined = no link given, so App picks the landing page (Live while games are on, else League). */
  page: PageId | DetailId | undefined;
  /** The part after the page, e.g. "luck" in #/league/luck. Each page checks its own. */
  sub: string | undefined;
}

function routeFromHash(): Route {
  const [first, second] = window.location.hash.replace(/^#\/?/, "").split("/");
  // Old links (#/table, #/trades, #/waivers, #/players) still work.
  if (first === "table") return { page: "league", sub: "table" };
  if (first === "trades" || first === "waivers" || first === "players") return { page: "moves", sub: first };
  if (first === "player" || first === "manager") return { page: first, sub: second };
  const page = PAGES.find((p) => p.id === first)?.id;
  return { page, sub: second };
}

/** Page changes this visit, so Back only steps back within the site. */
let moves = 0;

function useRoute(): Route {
  const [page, setPage] = useState<Route>(routeFromHash);
  useEffect(() => {
    const onChange = () => {
      moves++;
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
  const route = useRoute();
  const ready = data.status === "ready" ? data.value : null;
  const { sub } = route;
  const page: PageId | DetailId = route.page ?? (ready?.inProgress ? "live" : "league");
  const detail = page === "player" || page === "manager";
  const { myTeam, decided, setMyTeam } = useMyTeam(ready ? [...ready.entries.keys()] : undefined);

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-row">
          <div>
            <h1>{ready?.league.league.name ?? "Drafty In Here"}</h1>
            {ready && <p className="sub">{headline(ready)}</p>}
          </div>
          {ready && (
            <div className="masthead-tools">
              <SearchButton data={ready} />
              {decided && <TeamPicker data={ready} value={myTeam} onChange={setMyTeam} compact />}
            </div>
          )}
        </div>
        {ready && <DeadlineBanner data={ready} />}
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
            {detail && <BackLink />}
            {page === "player" && <PlayerPage id={Number(sub)} data={ready} myTeam={myTeam} />}
            {page === "manager" && <ManagerPage id={Number(sub)} data={ready} myTeam={myTeam} />}
            {page === "moves" && (
              <MovesPage data={ready} myTeam={myTeam} view={MOVES_VIEWS.find((v) => v.id === sub)?.id ?? "trades"} />
            )}
            {page === "draft" && (
              <DraftPage data={ready} myTeam={myTeam} view={DRAFT_VIEWS.find((v) => v.id === sub)?.id ?? "grades"} />
            )}
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

const DEADLINE_LABELS: Record<DeadlineKind, string> = { trades: "Trades", waivers: "Waivers", team: "Team deadline" };

/** The next gameweek's trade, waiver and team deadlines, in the viewer's own time zone. */
function DeadlineBanner({ data }: { data: LeagueData }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const up = upcomingDeadlines(data.deadlines, now);
  if (!up) return null;
  return (
    <section className="deadlines" aria-label={`Gameweek ${up.event} deadlines`}>
      <span className="dl-gw">GW{up.event}</span>
      {up.items.map((d) => (
        <div key={d.kind} className={`dl${d.passed ? " passed" : ""}${d.kind === up.next ? " next" : ""}`}>
          <span className="dl-label">{DEADLINE_LABELS[d.kind]}</span>
          <span className="dl-time">{d.passed ? "Closed" : deadlineTime(d.at, now)}</span>
          {d.kind === up.next && <span className="dl-in">{countdown(d.at, now)}</span>}
        </div>
      ))}
    </section>
  );
}

/**
 * "Sat 11:00" when it's less than a week away (so the weekday can't be
 * mistaken), "Fri 23 Oct" further out. Kept short so three deadlines fit
 * side by side on a phone.
 */
export function deadlineTime(iso: string, now: number): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short" });
  if (d.getTime() - now >= 7 * 24 * 3600_000) {
    return `${weekday} ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  }
  return `${weekday} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Back to wherever they tapped the name, or the home page if they arrived by a shared link. */
function BackLink() {
  return (
    <a
      className="link back-link"
      href="#/"
      onClick={(e) => {
        if (moves > 0) {
          e.preventDefault();
          window.history.back();
        }
      }}
    >
      ← Back
    </a>
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
