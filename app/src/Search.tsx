import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { managerName } from "../../shared/standings";
import { foldText as fold, playerSearchText } from "./bits";
import type { LeagueData } from "./data";

interface Hit {
  key: string;
  href: string;
  title: string;
  meta: string;
}

/** Managers first (there are only 14), then players; names that start with the search come first. */
export function searchLeague(data: LeagueData, query: string, maxPlayers = 8): Hit[] {
  const q = fold(query.trim());
  if (!q) return [];
  const rank = (name: string) => (fold(name).startsWith(q) ? 0 : 1);
  const managers = [...data.entries.values()]
    .filter((e) => fold(`${managerName(e)} ${e.entry_name} ${data.labels.get(e.entry_id) ?? ""}`).includes(q))
    .sort((a, b) => rank(a.player_first_name) - rank(b.player_first_name))
    .map((e) => ({
      key: `m${e.entry_id}`,
      href: `#/manager/${e.entry_id}`,
      title: managerName(e),
      meta: `Manager · ${e.entry_name}`,
    }));
  const players = data.playerList
    .filter((p) => playerSearchText(p).includes(q))
    .sort((a, b) => rank(a.name) - rank(b.name) || b.totalPoints - a.totalPoints)
    .slice(0, maxPlayers)
    .map((p) => {
      const owner = data.owners.get(p.id);
      return {
        key: `p${p.id}`,
        href: `#/player/${p.id}`,
        title: p.name,
        meta: `${p.team} ${p.position} · ${owner ? data.labels.get(owner) : "Free agent"}`,
      };
    });
  return [...managers, ...players];
}

/** A search button in the header that opens a full-screen search for players and managers. */
export function SearchButton({ data }: { data: LeagueData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="search-btn" onClick={() => setOpen(true)} aria-label="Search players and managers">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      {/* Drawn on the page itself, so it covers the sticky tabs rather than sitting under them. */}
      {open && createPortal(<SearchSheet data={data} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function SearchSheet({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const hits = searchLeague(data, query);
  return (
    <div className="search-sheet" role="dialog" aria-label="Search">
      <div className="search-bar">
        <input
          ref={input}
          className="search"
          type="search"
          placeholder="Player or manager"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) {
              window.location.hash = hits[0].href;
              onClose();
            }
          }}
        />
        <button type="button" className="link search-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
      {query.trim() && hits.length === 0 && <p className="notice">No player or manager matches that.</p>}
      <ul className="plain search-hits">
        {hits.map((h) => (
          <li key={h.key}>
            <a href={h.href} onClick={onClose}>
              <span className="search-title">{h.title}</span>
              <span className="search-meta">{h.meta}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
