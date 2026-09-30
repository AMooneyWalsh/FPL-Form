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
