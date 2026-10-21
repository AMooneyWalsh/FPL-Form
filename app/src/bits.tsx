import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Player } from "../../shared/types";
import { isOut } from "../../shared/waivers";
import type { LeagueData } from "./data";

export function PlayerName({ id, data, detail = true }: { id: number; data: LeagueData; detail?: boolean }) {
  const p = data.players.get(id);
  if (!p) return <span>Player {id}</span>;
  return (
    <a className="player" href={`#/player/${id}`}>
      {p.name}
      <InjuryFlag p={p} />
      {detail && (
        <span className="player-meta">
          {" "}
          {p.team} {p.position}
        </span>
      )}
    </a>
  );
}

/** A small "Out" / "75%" tag for injured, suspended or doubtful players. News shows on hover. */
export function InjuryFlag({ p }: { p: Player }) {
  if (p.status === "a" || !p.status) return null;
  const out = isOut(p);
  const text = out ? (p.status === "s" ? "Ban" : "Out") : p.chanceNext !== null ? `${p.chanceNext}%` : "Doubt";
  return (
    <Tag tone={out ? "bad" : "warn"} title={p.news || undefined} className="flag">
      {text}
    </Tag>
  );
}

// ---------------------------------------------------------------- design system pieces
// See docs/design-system.md, and #/styleguide for all of them on one page.

export type TagTone = "good" | "warn" | "bad" | "neutral" | "mine" | "live";

/** A small status label: "Out", "75%", "Starting", "Live". The tone says what it means, not what colour it is. */
export function Tag({
  tone,
  children,
  title,
  className,
}: {
  tone: TagTone;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span className={`tag tag-${tone}${className ? ` ${className}` : ""}`} title={title}>
      {children}
    </span>
  );
}

export interface StatRank {
  text: string;
  /** Green for the good end of the league, red for the bad end, grey otherwise. */
  tone: "good" | "bad" | "meh";
}

/** One number in a tile, e.g. "1st / Position", with an optional league rank under it. Use inside a .stat-row. */
export function StatTile({ label, value, rank }: { label: string; value: string; rank?: StatRank }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {rank && <span className={`stat-rank ${rank.tone}`}>{rank.text}</span>}
    </div>
  );
}

/** A section title with its controls (a Show filter, a picker, a Live tag) on the right. */
export function SectionHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** A titled group that folds away, e.g. one gameweek of waiver battles. `open` is only where it starts. */
export function FoldSection({
  title,
  count,
  open,
  children,
}: {
  title: string;
  count?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="fold-section" open={open}>
      <summary>
        <span className="fold-section-title">{title}</span>
        {count && <span className="muted">{count}</span>}
      </summary>
      {children}
    </details>
  );
}

/** "How this works": the explanation of a number, folded away until someone asks for it. */
export function Explainer({ children, label = "How this works" }: { children: ReactNode; label?: string }) {
  return (
    <details className="explainer">
      <summary>{label}</summary>
      <div className="explainer-body">{children}</div>
    </details>
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

/** Lower case without accents, so "odegaard" finds Ødegaard and "gyokeres" finds Gyökeres. */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[łđ]/g, (c) => (c === "ł" ? "l" : "d"))
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function playerSearchText(p: Player): string {
  return foldText(`${p.name} ${p.fullName} ${p.team}`);
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
  const [bar, more, measure] = useScrollEdges<HTMLElement>();
  // On a phone the menu can be wider than the screen, so bring the current one into view.
  useEffect(() => {
    const el = active.current;
    const nav = bar.current;
    if (el && nav) nav.scrollLeft = el.offsetLeft - nav.offsetLeft - 16;
    measure();
  }, [current]);
  return (
    <div className={`subnav-wrap${edgeClasses(more)}`}>
      <nav ref={bar} className="chips subnav" aria-label={label} onScroll={measure}>
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
    </div>
  );
}

/**
 * Whether something that scrolls sideways has more past its left or right
 * edge, so it can fade that edge. Re-measures on scroll, resize and render.
 */
function useScrollEdges<T extends HTMLElement>(): [RefObject<T | null>, Edges, () => void] {
  const ref = useRef<T>(null);
  const [more, setMore] = useState<Edges>({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  return [ref, more, measure];
}

interface Edges {
  left: boolean;
  right: boolean;
}

function edgeClasses(more: Edges): string {
  return `${more.left ? " more-left" : ""}${more.right ? " more-right" : ""}`;
}

/**
 * Every data table goes in one of these. On a phone it scrolls sideways with
 * the first column frozen, so put who the row is about (and their place or
 * number, as a RowNo) first, then the most important number, then the rest.
 * Never hide columns on small screens.
 */
export function ScrollTable({ children }: { children: ReactNode }) {
  const [ref, more, measure] = useScrollEdges<HTMLDivElement>();
  return (
    <div className={`scroll-table${edgeClasses(more)}`}>
      <div ref={ref} className="table-wrap" onScroll={measure}>
        {children}
      </div>
    </div>
  );
}

/** A place or pick number at the start of a frozen first cell: "1", "3rd", "#35". */
export function RowNo({ children }: { children: ReactNode }) {
  return <span className="row-no">{children}</span>;
}

/** Settings carried in the link after a "?", e.g. a=1412 in #/league/h2h?a=1412&b=72619. */
export function hashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
}

/**
 * Updates the settings in the link without moving the page, so a pick can be
 * shared by copying the address. Doesn't fire hashchange (no scroll to top).
 * Empty or null values are left out.
 */
export function replaceHashParams(values: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined && v !== "") params.set(k, String(v));
  const base = window.location.hash.split("?")[0] || "#/";
  const query = params.toString();
  window.history.replaceState(window.history.state, "", query ? `${base}?${query}` : base);
}
