// Share cards: the pictures someone posts in the league chat (a match result, a
// trade verdict, a manager card). This file decides the words and numbers on
// them; app/src/share.ts draws them. See docs/share-cards.md.

import type { LiveMatch, LiveSquad } from "./live";
import type { TradeSide, TradeVerdict } from "./moves";

// ---------------------------------------------------------------- what a card holds

/** What a colour means on a card, as on the site: green good, red bad, grey neither, red live. */
export type ShareTone = "good" | "bad" | "neutral" | "live";

/** A small pill: "Live", "Final", "Won". Outlined while it could still change, solid once it can't. */
export interface ShareTag {
  text: string;
  tone: ShareTone;
  outline?: boolean;
}

/**
 * One picture. The purple band at the top holds the kicker (usually the league
 * name), the title and an optional subtitle and tag; the blocks are stacked
 * underneath, top to bottom. The renderer adds the "draftyinhere.com" line.
 */
export interface ShareCard {
  kicker: string;
  title: string;
  subtitle?: string;
  tag?: ShareTag;
  blocks: ShareBlock[];
  /** Sent along with the picture (WhatsApp shows it as the caption). */
  caption: string;
  /** File name for the picture, without ".png". */
  file: string;
}

export type ShareBlock = VersusBlock | HeadlineBlock | StatsBlock | LinesBlock | FormBlock;

/** Two sides next to each other with a big number each: a match, a trade. */
export interface VersusBlock {
  kind: "versus";
  sides: [VersusSide, VersusSide];
}

export interface VersusSide {
  name: string;
  /** Under the name: team name, "got". */
  detail?: string;
  /** The big number (score, points). Left out when there isn't one yet. */
  big?: string;
  /** Small words under the big number, e.g. "points". */
  bigLabel?: string;
  /** The winner (or whoever's ahead): drawn on a green panel. */
  highlight?: boolean;
  badge?: ShareTag;
  /** One quiet line, e.g. "3 still to play". */
  note?: string;
  rows: ShareRow[];
  /** Shown instead of the rows when there are none. */
  empty?: string;
}

/** One line: a name on the left, a number on the right. */
export interface ShareRow {
  label: string;
  value?: string;
  tone?: ShareTone;
}

/** One big statement, e.g. a trade verdict, with a line of explanation under it. */
export interface HeadlineBlock {
  kind: "headline";
  text: string;
  tone?: ShareTone;
  detail?: string;
}

/** Tiles of one number each, like StatTile on the site. */
export interface StatsBlock {
  kind: "stats";
  title?: string;
  items: ShareStat[];
  /** Tiles per row. Defaults to all of them in one row (up to 4). */
  columns?: number;
}

export interface ShareStat {
  value: string;
  label: string;
  /** "Best in league", "3rd worst": coloured by tone. */
  rank?: { text: string; tone: ShareTone };
}

/** A card of rows under an optional title: top scorers, results, awards. */
export interface LinesBlock {
  kind: "lines";
  title?: string;
  rows: ShareRow[];
}

/** W/D/L chips, e.g. the last five results. */
export interface FormBlock {
  kind: "form";
  label: string;
  results: ("W" | "D" | "L")[];
}

/** The names a card needs, looked up by id. */
export interface ShareNames {
  league: string;
  /** Short manager names ("Ben", "Ruairi G") keyed by entry_id. */
  managers: Map<number, string>;
  /** Team names keyed by entry_id. */
  teams: Map<number, string>;
  /** Player names keyed by FPL player id. */
  players: Map<number, string>;
}

// ---------------------------------------------------------------- match result

/**
 * Where a head to head match is: being played, everyone in it has played but FPL
 * hasn't confirmed the gameweek yet, or confirmed and final.
 */
export type MatchState = "live" | "done" | "final";

const MATCH_TAGS: Record<MatchState, ShareTag> = {
  live: { text: "Live", tone: "live" },
  done: { text: "Full time", tone: "neutral" },
  final: { text: "Final", tone: "neutral" },
};

/** A head to head match: both scores, who won (or is ahead) and each side's top three scorers. */
export function matchCard(m: LiveMatch, event: number, state: MatchState, names: ShareNames): ShareCard {
  const h = m.home?.score ?? 0;
  const a = m.away?.score ?? 0;
  const home = names.managers.get(m.homeEntry) ?? "Someone";
  const away = names.managers.get(m.awayEntry) ?? "Someone";
  const side = (entry: number, squad: LiveSquad | null, mine: number, theirs: number): VersusSide => {
    const decided = state !== "live";
    const badge: ShareTag | undefined = decided
      ? mine > theirs
        ? { text: "Won", tone: "good" }
        : mine < theirs
          ? { text: "Lost", tone: "bad" }
          : { text: "Draw", tone: "neutral" }
      : mine > theirs
        ? { text: "Ahead", tone: "good" }
        : undefined;
    return {
      name: names.managers.get(entry) ?? "Someone",
      detail: names.teams.get(entry),
      big: String(mine),
      highlight: mine > theirs,
      // Outlined until FPL confirms the gameweek, as on the site.
      badge: badge && { ...badge, outline: state !== "final" },
      note: state === "live" && squad ? (squad.toPlay > 0 ? `${squad.toPlay} still to play` : "All played") : undefined,
      rows: topScorers(squad, 3).map((p) => ({ label: names.players.get(p.element) ?? "Someone", value: String(p.points) })),
      empty: "No points yet",
    };
  };
  const score = `${home} ${h}-${a} ${away}`;
  return {
    kicker: names.league,
    title: `Gameweek ${event}`,
    tag: MATCH_TAGS[state],
    blocks: [{ kind: "versus", sides: [side(m.homeEntry, m.home, h, a), side(m.awayEntry, m.away, a, h)] }],
    caption:
      state === "live"
        ? `Gameweek ${event}, live: ${score}`
        : h === a
          ? `${home} and ${away} drew ${h}-${a} in gameweek ${event}.`
          : h > a
            ? `${home} beat ${away} ${h}-${a} in gameweek ${event}.`
            : `${away} beat ${home} ${a}-${h} in gameweek ${event}.`,
    file: slug(`gw${event} ${home} v ${away}`),
  };
}

/** The players who scored most in the XI that counts. Nobody on nil or less. */
export function topScorers(squad: LiveSquad | null, n: number): { element: number; points: number }[] {
  if (!squad) return [];
  return squad.players
    .filter((p) => p.counts && p.points > 0)
    .sort((a, b) => b.points - a.points || a.slot - b.slot)
    .slice(0, n);
}

// ---------------------------------------------------------------- trade verdict

/** One trade: who got whom, what each side has scored since, and who's ahead. */
export function tradeCard(v: TradeVerdict, names: ShareNames): ShareCard {
  const who = (s: TradeSide) => names.managers.get(s.entryId) ?? "Someone";
  const date = new Date(v.time).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const winner = v.winner === null ? null : (names.managers.get(v.winner) ?? "Someone");
  const verdict = v.pending ? "Too early to call" : winner === null ? "Level so far" : `${winner} +${v.margin}`;
  const side = (s: TradeSide): VersusSide => ({
    name: who(s),
    detail: "got",
    big: v.pending ? undefined : String(Math.round(s.total)),
    bigLabel: v.pending ? undefined : Math.round(s.total) === 1 ? "point" : "points",
    highlight: !v.pending && v.winner === s.entryId,
    rows: s.received.map((p) => ({
      label: names.players.get(p.element) ?? "Someone",
      value: v.pending ? undefined : String(Math.round(p.value)),
    })),
  });
  const pair = `${who(v.offerer)} and ${who(v.receiver)}`;
  return {
    kicker: `${names.league} · Trade verdict`,
    title: verdict,
    subtitle: `${pair} · gameweek ${v.event} · ${date}`,
    blocks: [{ kind: "versus", sides: [side(v.offerer), side(v.receiver)] }],
    caption: `${pair}'s gameweek ${v.event} trade: ${winner === null || v.pending ? verdict.toLowerCase() : `${verdict} so far`}.`,
    file: slug(`trade gw${v.event} ${who(v.offerer)} ${who(v.receiver)}`),
  };
}

// ---------------------------------------------------------------- text that fits

/**
 * The text, cut short with "…" if it's wider than `max`. `measure` gives a
 * string's width (the canvas's measureText on the site). Cuts between whole
 * characters, so an emoji or an accented letter is never split.
 */
export function trimToWidth(text: string, max: number, measure: (s: string) => number): string {
  if (measure(text) <= max) return text;
  const chars = graphemes(text);
  // The longest start that still fits with the "…" on the end.
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${chars.slice(0, mid).join("").trimEnd()}…`) <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join("").trimEnd()}…`;
}

/** The text broken into lines no wider than `max`, at most `maxLines` of them (the last cut short with "…"). */
export function wrapToWidth(text: string, max: number, measure: (s: string) => number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const [i, word] of words.entries()) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next) <= max) {
      line = next;
      continue;
    }
    // Out of lines: the rest goes on the last one, cut short.
    if (lines.length === maxLines - 1) return [...lines, trimToWidth(`${line} ${words.slice(i).join(" ")}`, max, measure)];
    lines.push(trimToWidth(line, max, measure));
    line = word;
  }
  if (line) lines.push(trimToWidth(line, max, measure));
  return lines;
}

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  }
  return Array.from(text);
}

/** "gw7 Ruairi M v Adam" -> "gw7-ruairi-m-v-adam", safe for a file name. */
export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "drafty-in-here"
  );
}
