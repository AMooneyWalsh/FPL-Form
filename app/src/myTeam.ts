import { useState } from "react";

const KEY = "myTeamEntryId";
/** Stored when someone says they're just browsing. */
const BROWSING = 0;

function read(): number | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

/**
 * The viewer's own team, remembered on their device. Nobody gets a team
 * until they pick one, so friends don't all see the owner's team as theirs.
 * A saved team that isn't in this league (e.g. last season's) is ignored.
 */
export function useMyTeam(validIds: number[] | undefined) {
  const [stored, setStored] = useState<number | null>(read);
  const set = (id: number | null) => {
    const value = id ?? BROWSING;
    setStored(value);
    try {
      window.localStorage.setItem(KEY, String(value));
    } catch {
      // Private browsing etc. Still works for this visit.
    }
  };
  const valid = stored !== null && stored !== BROWSING && (validIds?.includes(stored) ?? false);
  return {
    myTeam: valid ? stored : null,
    /** They've picked a team or said they're browsing. */
    decided: stored === BROWSING || valid,
    setMyTeam: set,
  };
}
