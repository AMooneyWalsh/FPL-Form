import { useState } from "react";

const KEY = "myTeamEntryId";

function read(): number | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

/** The viewer's own team, remembered on their device. */
export function useMyTeam(defaultEntryId: number | undefined) {
  const [chosen, setChosen] = useState<number | null>(read);
  const set = (id: number) => {
    setChosen(id);
    try {
      window.localStorage.setItem(KEY, String(id));
    } catch {
      // Private browsing etc. Still works for this visit.
    }
  };
  return [chosen ?? defaultEntryId ?? null, set] as const;
}
