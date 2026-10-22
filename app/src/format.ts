export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

/** 1st, 2nd, 3rd, 11th, 22nd... */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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
