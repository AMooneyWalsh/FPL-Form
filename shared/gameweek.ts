// One gameweek, boiled down to what the trade and draft analysis needs:
// every player's points, and who each manager actually fielded.

export interface RawLive {
  elements: Record<string, { stats: { total_points: number; minutes: number } }>;
}

export interface RawPicks {
  picks: { element: number; position: number }[];
  /** Auto-subs FPL applied after the gameweek. */
  subs: { element_in: number; element_out: number }[];
}

export interface Squad {
  /** The XI that counted, after auto-subs. */
  played: number[];
  /** The rest of the 15. */
  bench: number[];
}

export interface Gameweek {
  event: number;
  /** Points per player id. Players on 0 are left out to keep it small. */
  points: Record<number, number>;
  /** Keyed by team entry_id (not league entry id). */
  squads: Record<number, Squad>;
}

const XI = 11;

export function buildGameweek(event: number, live: RawLive, picksByEntry: Record<number, RawPicks>): Gameweek {
  const points: Record<number, number> = {};
  for (const [id, el] of Object.entries(live.elements)) {
    if (el.stats.total_points !== 0) points[Number(id)] = el.stats.total_points;
  }

  const squads: Record<number, Squad> = {};
  for (const [entryId, raw] of Object.entries(picksByEntry)) {
    const ordered = [...raw.picks].sort((a, b) => a.position - b.position).map((p) => p.element);
    const played = new Set(ordered.slice(0, XI));
    for (const s of raw.subs ?? []) {
      played.delete(s.element_out);
      played.add(s.element_in);
    }
    squads[Number(entryId)] = {
      played: ordered.filter((el) => played.has(el)),
      bench: ordered.filter((el) => !played.has(el)),
    };
  }
  return { event, points, squads };
}

export function squadScore(gw: Gameweek, entryId: number): number {
  const squad = gw.squads[entryId];
  if (!squad) return 0;
  return squad.played.reduce((sum, el) => sum + (gw.points[el] ?? 0), 0);
}

/** Who owned each player this gameweek (players nobody owned are absent). */
export function ownersOf(gw: Gameweek): Map<number, { entryId: number; played: boolean }> {
  const owners = new Map<number, { entryId: number; played: boolean }>();
  for (const [entryId, squad] of Object.entries(gw.squads)) {
    for (const el of squad.played) owners.set(el, { entryId: Number(entryId), played: true });
    for (const el of squad.bench) owners.set(el, { entryId: Number(entryId), played: false });
  }
  return owners;
}
