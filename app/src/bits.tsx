import type { Player } from "../../shared/types";
import type { LeagueData } from "./data";

export function PlayerName({ id, data, detail = true }: { id: number; data: LeagueData; detail?: boolean }) {
  const p = data.players.get(id);
  if (!p) return <span>Player {id}</span>;
  return (
    <span className="player">
      {p.name}
      {detail && (
        <span className="player-meta">
          {" "}
          {p.team} {p.position}
        </span>
      )}
    </span>
  );
}

export function Manager({ id, data, mine }: { id: number; data: LeagueData; mine?: number | null }) {
  return <span className={id === mine ? "mgr mine-name" : "mgr"}>{data.labels.get(id) ?? "Someone"}</span>;
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

export function MineToggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> Just mine
    </label>
  );
}
