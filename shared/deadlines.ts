// The next gameweek's trade, waiver and team deadlines, for the banner at the
// top of every page.

import type { Deadlines } from "./types";

export type DeadlineKind = "trades" | "waivers" | "team";

export interface DeadlineStatus {
  kind: DeadlineKind;
  at: string;
  passed: boolean;
}

export interface UpcomingDeadlines {
  event: number;
  items: DeadlineStatus[];
  /** The first one still to come. */
  next: DeadlineKind;
}

/** The first gameweek whose team deadline is still to come, or null once the season's done. */
export function upcomingDeadlines(all: Deadlines[], now = Date.now()): UpcomingDeadlines | null {
  const gw = [...all].sort((a, b) => a.event - b.event).find((d) => new Date(d.team).getTime() > now);
  if (!gw) return null;
  const items = (["trades", "waivers", "team"] as const).map((kind) => ({
    kind,
    at: gw[kind],
    passed: new Date(gw[kind]).getTime() <= now,
  }));
  return { event: gw.event, items, next: items.find((i) => !i.passed)!.kind };
}

/** "in 3 days", "in 13 h", "in 25 min". */
export function countdown(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
  if (mins < 60) return mins <= 1 ? "in 1 min" : `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} days`;
}

/** The next deadline of one kind still to come (e.g. the next waiver deadline), or null once the season's done. */
export function nextDeadline(all: Deadlines[], kind: DeadlineKind, now = Date.now()): { event: number; at: string } | null {
  const gw = [...all].sort((a, b) => a.event - b.event).find((d) => new Date(d[kind]).getTime() > now);
  return gw ? { event: gw.event, at: gw[kind] } : null;
}
