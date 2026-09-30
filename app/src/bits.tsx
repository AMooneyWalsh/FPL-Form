import { useEffect, useRef, useState } from "react";
import type { Player } from "../../shared/types";
import type { LeagueData } from "./data";

export function PlayerName({ id, data, detail = true }: { id: number; data: LeagueData; detail?: boolean }) {
  const p = data.players.get(id);
  if (!p) return <span>Player {id}</span>;
  return (
    <a className="player" href={`#/player/${id}`}>
      {p.name}
      {detail && (
        <span className="player-meta">
          {" "}
          {p.team} {p.position}
        </span>
      )}
    </a>
  );
}

export function Manager({ id, data, mine }: { id: number; data: LeagueData; mine?: number | null }) {
  return (
    <a className={id === mine ? "mgr mine-name" : "mgr"} href={`#/manager/${id}`}>
      {data.labels.get(id) ?? "Someone"}
    </a>
  );
}

export function Pts({ n, signed = false }: { n: number; signed?: boolean }) {
  const text = signed && n > 0 ? `+${n}` : String(n);
  return <span className={signed ? (n > 0 ? "pts-pos" : n < 0 ? "pts-neg" : "") : undefined}>{text}</span>;
}

export function playerSearchText(p: Player): string {
  return `${p.name} ${p.fullName} ${p.team}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const SHOW_KEY = "showManager";

/** The manager picked in a "Show" filter. Shared by every page and kept for this visit,
 * so picking Ben on Trades still shows Ben on Waivers. null = everyone. */
export function useShownManager(): [number | null, (id: number | null) => void] {
  const [who, setWho] = useState<number | null>(() => {
    try {
      const v = window.sessionStorage.getItem(SHOW_KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });
  const set = (id: number | null) => {
    setWho(id);
    try {
      window.sessionStorage.setItem(SHOW_KEY, id === null ? "" : String(id));
    } catch {
      // Private browsing: still works on this page.
    }
  };
  return [who, set];
}

/** "Show: Everyone / Me / any manager" filter for long lists. null = everyone. */
export function ShowFilter({
  data,
  value,
  onChange,
  myTeam,
}: {
  data: LeagueData;
  value: number | null;
  onChange: (id: number | null) => void;
  myTeam: number | null;
}) {
  const others = [...data.entries.keys()]
    .filter((id) => id !== myTeam)
    .sort((a, b) => (data.labels.get(a) ?? "").localeCompare(data.labels.get(b) ?? ""));
  return (
    <label className="show-filter">
      <span className="picker-label">Show</span>
      <select
        className="select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">Everyone</option>
        {myTeam !== null && <option value={myTeam}>Me ({data.labels.get(myTeam)})</option>}
        {others.map((id) => (
          <option key={id} value={id}>
            {data.labels.get(id)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** "You haven't…" or "Ben hasn't…" */
export function nobody(data: LeagueData, who: number, myTeam: number | null, action: string): string {
  return who === myTeam ? `You haven't ${action} yet.` : `${data.labels.get(who)} hasn't ${action} yet.`;
}

/** The chip menu under the top tabs (e.g. League: Table / Form / ...). Stays on screen while scrolling. */
export function SubNav({
  page,
  views,
  current,
  label,
}: {
  page: string;
  views: readonly { id: string; label: string }[];
  current: string;
  label: string;
}) {
  const active = useRef<HTMLAnchorElement>(null);
  // On a phone the menu can be wider than the screen, so bring the current one into view.
  useEffect(() => {
    const el = active.current;
    const bar = el?.parentElement;
    if (el && bar) bar.scrollLeft = el.offsetLeft - bar.offsetLeft - 16;
  }, [current]);
  return (
    <nav className="chips subnav" aria-label={label}>
      {views.map((v) => (
        <a
          key={v.id}
          ref={v.id === current ? active : undefined}
          href={`#/${page}/${v.id}`}
          className={v.id === current ? "chip-btn active" : "chip-btn"}
          aria-current={v.id === current ? "page" : undefined}
        >
          {v.label}
        </a>
      ))}
    </nav>
  );
}
