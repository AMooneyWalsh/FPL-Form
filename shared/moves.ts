// Trade and waiver analysis. Points are always "points that counted": a player
// only earns for a manager in gameweeks where that manager owned him and he
// was in the XI that scored (after auto-subs).

import { ownersOf, type Gameweek } from "./gameweek";
import type { DraftChoice, Trade, Transaction } from "./types";

export class Seasons {
  readonly gameweeks: Gameweek[];
  private owners: Map<number, { entryId: number; played: boolean }>[];

  constructor(gameweeks: Gameweek[]) {
    this.gameweeks = [...gameweeks].sort((a, b) => a.event - b.event);
    this.owners = this.gameweeks.map(ownersOf);
  }

  get lastEvent(): number {
    return this.gameweeks.at(-1)?.event ?? 0;
  }

  ownerAt(element: number, event: number) {
    const i = this.gameweeks.findIndex((g) => g.event === event);
    return i === -1 ? undefined : this.owners[i].get(element);
  }

  /**
   * Points a player earned for one manager, starting at `fromEvent` and
   * stopping the first gameweek that manager no longer owned him.
   */
  spell(element: number, entryId: number, fromEvent: number) {
    let points = 0;
    let benchPoints = 0;
    let gameweeks = 0;
    let stillOwned = false;
    for (let i = 0; i < this.gameweeks.length; i++) {
      const gw = this.gameweeks[i];
      if (gw.event < fromEvent) continue;
      const owner = this.owners[i].get(element);
      if (owner?.entryId !== entryId) {
        stillOwned = false;
        break;
      }
      stillOwned = true;
      gameweeks++;
      const pts = gw.points[element] ?? 0;
      if (owner.played) points += pts;
      else benchPoints += pts;
    }
    return { points, benchPoints, gameweeks, stillOwned };
  }
}

// ---------------------------------------------------------------- trades
//
// Trade cards follow the chain: if you trade a player on, the trade you got
// him in also gets credit for what you got for him (shared equally if he went
// with others), and so on. Dropping a player ends the chain. The ledger below
// never follows chains, so it never counts a point twice.
// Full explanation: docs/trade-scoring.md

/** Where a player went when his new manager traded him on. */
export interface Onward {
  tradeId: number;
  event: number;
  /** What came back in that trade. */
  received: number[];
  /** Players the manager sent in that trade (this one included). */
  sentWith: number[];
  /** This player's share of what came back. */
  value: number;
}

export interface TradedPlayer {
  element: number;
  /** Points he scored for this manager, in their XI, while they had him. */
  points: number;
  benchPoints: number;
  gameweeks: number;
  stillOwned: boolean;
  /** Set if the manager traded him on. */
  onward: Onward | null;
  /** Set if the manager dropped him for a waiver or free agent. */
  droppedEvent: number | null;
  /** points + onward value: what he was worth to this manager in the end. */
  value: number;
  /** "On paper": all his FPL points since the trade, whoever owned him. */
  raw: number;
}

export interface TradeSide {
  entryId: number;
  received: TradedPlayer[];
  /** Sum of values (follows chains). Decides the verdict. */
  total: number;
  /** Sum of plain points (no chains). Used by the ledger. */
  spellTotal: number;
  raw: number;
}

export interface TradeVerdict {
  id: number;
  event: number;
  time: string;
  offerer: TradeSide;
  receiver: TradeSide;
  /** entry_id of whoever's side is ahead, or null if level. */
  winner: number | null;
  /** Whole points, rounded. */
  margin: number;
  /** No gameweek has been played since the trade yet. */
  pending: boolean;
}

interface Move {
  trade: Trade;
  time: string;
  /** entry_id -> players they received */
  got: Map<number, number[]>;
  /** entry_id -> players they sent */
  sent: Map<number, number[]>;
}

function toMove(t: Trade): Move {
  const ins = t.tradeitem_set.map((i) => i.element_in);
  const outs = t.tradeitem_set.map((i) => i.element_out);
  return {
    trade: t,
    time: t.response_time ?? t.offer_time,
    got: new Map([
      [t.offered_entry, ins],
      [t.received_entry, outs],
    ]),
    sent: new Map([
      [t.offered_entry, outs],
      [t.received_entry, ins],
    ]),
  };
}

export function tradeVerdicts(trades: Trade[], seasons: Seasons, transactions: Transaction[] = []): TradeVerdict[] {
  const moves = trades
    .filter((t) => t.state === "p")
    .map(toMove)
    .sort((a, b) => a.time.localeCompare(b.time));
  const drops = transactions.filter((t) => t.result === "a");
  const memo = new Map<string, TradedPlayer>();

  const raw = (element: number, from: number) =>
    seasons.gameweeks.filter((g) => g.event >= from).reduce((sum, g) => sum + (g.points[element] ?? 0), 0);

  /** What `element` was worth to `entryId`, who got him in `move`. */
  function worth(element: number, entryId: number, move: Move): TradedPlayer {
    const key = `${element}:${entryId}:${move.trade.id}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const spell = seasons.spell(element, entryId, move.trade.event);
    // He was continuously theirs up to this gameweek (exclusive).
    const heldUntil = move.trade.event + spell.gameweeks;

    // Did they drop him before any onward trade?
    const drop = drops
      .filter((t) => t.entry === entryId && t.element_out === element && t.added > move.time)
      .sort((a, b) => a.added.localeCompare(b.added))[0];
    const next = moves.find(
      (m) =>
        m.time > move.time &&
        (m.sent.get(entryId) ?? []).includes(element) &&
        m.trade.event <= heldUntil &&
        (!drop || m.time < drop.added),
    );

    let onward: Onward | null = null;
    if (next) {
      const sentWith = next.sent.get(entryId)!;
      const received = next.got.get(entryId)!;
      const back = received.reduce((sum, q) => sum + worth(q, entryId, next).value, 0);
      onward = { tradeId: next.trade.id, event: next.trade.event, received, sentWith, value: back / sentWith.length };
    }
    const result: TradedPlayer = {
      element,
      points: spell.points,
      benchPoints: spell.benchPoints,
      gameweeks: spell.gameweeks,
      stillOwned: spell.stillOwned,
      onward,
      droppedEvent: !onward && drop && drop.event <= seasons.lastEvent ? drop.event : null,
      value: spell.points + (onward?.value ?? 0),
      raw: raw(element, move.trade.event),
    };
    memo.set(key, result);
    return result;
  }

  return moves
    .map((m) => {
      const side = (entryId: number): TradeSide => {
        const received = m.got.get(entryId)!.map((el) => worth(el, entryId, m));
        return {
          entryId,
          received,
          total: received.reduce((s, p) => s + p.value, 0),
          spellTotal: received.reduce((s, p) => s + p.points, 0),
          raw: received.reduce((s, p) => s + p.raw, 0),
        };
      };
      const offerer = side(m.trade.offered_entry);
      const receiver = side(m.trade.received_entry);
      const margin = Math.round(Math.abs(offerer.total - receiver.total));
      return {
        id: m.trade.id,
        event: m.trade.event,
        time: m.time,
        offerer,
        receiver,
        winner: margin === 0 ? null : offerer.total > receiver.total ? offerer.entryId : receiver.entryId,
        margin,
        pending: seasons.lastEvent < m.trade.event,
      };
    })
    .sort((a, b) => b.time.localeCompare(a.time));
}

export interface LedgerRow {
  entryId: number;
  trades: number;
  won: number;
  lost: number;
  /** Points everyone they've traded for has scored for them. */
  gained: number;
  /** Points scored for new owners by players they gave away. Players they had
   * themselves got in a trade are left out, so passing someone straight on
   * isn't counted against them twice. */
  given: number;
  net: number;
  /** entry_id -> number of trades together. */
  partners: Map<number, number>;
}

export function tradeLedger(verdicts: TradeVerdict[], entryIds: number[]): LedgerRow[] {
  const rows = new Map<number, LedgerRow>(
    entryIds.map((id) => [id, { entryId: id, trades: 0, won: 0, lost: 0, gained: 0, given: 0, net: 0, partners: new Map() }]),
  );
  // entry_id -> players they've received in a trade so far (oldest trade first).
  const tradedIn = new Map<number, Set<number>>();
  const oldestFirst = [...verdicts].sort((a, b) => a.time.localeCompare(b.time));
  for (const v of oldestFirst) {
    for (const [me, them] of [
      [v.offerer, v.receiver],
      [v.receiver, v.offerer],
    ] as const) {
      const row = rows.get(me.entryId);
      if (!row) continue;
      const mine = tradedIn.get(me.entryId) ?? new Set<number>();
      row.trades++;
      row.gained += me.spellTotal;
      row.given += them.received.filter((p) => !mine.has(p.element)).reduce((sum, p) => sum + p.points, 0);
      if (!v.pending && v.winner === me.entryId) row.won++;
      if (!v.pending && v.winner === them.entryId) row.lost++;
      row.partners.set(them.entryId, (row.partners.get(them.entryId) ?? 0) + 1);
    }
    for (const side of [v.offerer, v.receiver]) {
      const set = tradedIn.get(side.entryId) ?? new Set<number>();
      side.received.forEach((p) => set.add(p.element));
      tradedIn.set(side.entryId, set);
    }
  }
  for (const row of rows.values()) row.net = row.gained - row.given;
  return [...rows.values()].sort((a, b) => b.net - a.net || b.trades - a.trades);
}

// ---------------------------------------------------------------- waivers

export interface Claim {
  entryId: number;
  result: Transaction["result"];
  priority: number;
  /** Who they'd have dropped. */
  dropping: number;
}

export interface WaiverBattle {
  event: number;
  element: number;
  claims: Claim[];
  winner: number | null;
  /** Points he has scored for the winner since (in their XI). */
  winnerPoints: number;
  stillOwned: boolean;
}

/** Every player more than one manager put a waiver claim in for. */
export function waiverBattles(transactions: Transaction[], seasons: Seasons): WaiverBattle[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.kind !== "w") continue;
    const key = `${t.event}:${t.element_in}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const battles: WaiverBattle[] = [];
  for (const claims of groups.values()) {
    const managers = new Set(claims.map((c) => c.entry));
    if (managers.size < 2) continue;
    const won = claims.find((c) => c.result === "a");
    const spell = won ? seasons.spell(won.element_in, won.entry, won.event) : null;
    battles.push({
      event: claims[0].event,
      element: claims[0].element_in,
      claims: bestClaimPerManager(claims),
      winner: won?.entry ?? null,
      winnerPoints: spell?.points ?? 0,
      stillOwned: spell?.stillOwned ?? false,
    });
  }
  return battles.sort((a, b) => b.event - a.event || b.claims.length - a.claims.length || b.winnerPoints - a.winnerPoints);
}

const RESULT_ORDER: Record<Transaction["result"], number> = { a: 0, di: 1, do: 2 };

function bestClaimPerManager(claims: Transaction[]): Claim[] {
  const best = new Map<number, Transaction>();
  for (const c of claims) {
    const cur = best.get(c.entry);
    if (!cur || RESULT_ORDER[c.result] < RESULT_ORDER[cur.result] || (c.result === cur.result && c.priority < cur.priority)) {
      best.set(c.entry, c);
    }
  }
  return [...best.values()]
    .sort((a, b) => RESULT_ORDER[a.result] - RESULT_ORDER[b.result] || a.priority - b.priority)
    .map((c) => ({ entryId: c.entry, result: c.result, priority: c.priority, dropping: c.element_out }));
}

export interface WaiverRow {
  entryId: number;
  claims: number;
  won: number;
  /** Claims lost to someone with higher priority. */
  outbid: number;
  freeAgents: number;
  /** Points scored for them by everyone they've picked up (waivers + free agents). */
  pickupPoints: number;
}

export function waiverRecord(transactions: Transaction[], seasons: Seasons, entryIds: number[]): WaiverRow[] {
  const rows = new Map<number, WaiverRow>(
    entryIds.map((id) => [id, { entryId: id, claims: 0, won: 0, outbid: 0, freeAgents: 0, pickupPoints: 0 }]),
  );
  for (const t of transactions) {
    const row = rows.get(t.entry);
    if (!row) continue;
    if (t.kind === "w") {
      row.claims++;
      if (t.result === "di") row.outbid++;
    }
    if (t.result !== "a") continue;
    if (t.kind === "w") row.won++;
    else row.freeAgents++;
    row.pickupPoints += seasons.spell(t.element_in, t.entry, t.event).points;
  }
  return [...rows.values()].sort((a, b) => b.pickupPoints - a.pickupPoints);
}

// ---------------------------------------------------------------- journeys

export type HowAcquired = "draft" | "waiver" | "free agent" | "trade" | "unknown";

export interface Stint {
  entryId: number;
  from: number;
  to: number;
  points: number;
  benchPoints: number;
  how: HowAcquired;
  /** Overall pick number. */
  draftPick?: number;
}

/** Every manager who has owned this player, in order, with what he scored for each. */
export function playerJourney(
  element: number,
  seasons: Seasons,
  moves: { transactions: Transaction[]; trades: Trade[]; draft: DraftChoice[] },
): Stint[] {
  const stints: Stint[] = [];
  for (const gw of seasons.gameweeks) {
    const owner = seasons.ownerAt(element, gw.event);
    const last = stints.at(-1);
    if (!owner) continue;
    const pts = gw.points[element] ?? 0;
    if (last && last.entryId === owner.entryId && last.to === gw.event - 1) {
      last.to = gw.event;
      if (owner.played) last.points += pts;
      else last.benchPoints += pts;
      continue;
    }
    stints.push({
      entryId: owner.entryId,
      from: gw.event,
      to: gw.event,
      points: owner.played ? pts : 0,
      benchPoints: owner.played ? 0 : pts,
      ...howAcquired(element, owner.entryId, gw.event, moves),
    });
  }
  return stints;
}

function howAcquired(
  element: number,
  entryId: number,
  event: number,
  { transactions, trades, draft }: { transactions: Transaction[]; trades: Trade[]; draft: DraftChoice[] },
): { how: HowAcquired; draftPick?: number } {
  const tx = transactions
    .filter((t) => t.result === "a" && t.entry === entryId && t.element_in === element && t.event <= event)
    .sort((a, b) => b.event - a.event)[0];
  const trade = trades
    .filter(
      (t) =>
        t.state === "p" &&
        t.event <= event &&
        t.tradeitem_set.some(
          (i) =>
            (t.offered_entry === entryId && i.element_in === element) ||
            (t.received_entry === entryId && i.element_out === element),
        ),
    )
    .sort((a, b) => b.event - a.event)[0];
  if (trade && (!tx || trade.event >= tx.event)) return { how: "trade" };
  if (tx) return { how: tx.kind === "w" ? "waiver" : "free agent" };
  const pick = draft.find((d) => d.entry === entryId && d.element === element);
  if (pick) return { how: "draft", draftPick: pick.index };
  return { how: "unknown" };
}

export interface Hop {
  entryId: number;
  event: number;
}

/** Managers who got this player in a trade but moved him on before he played
 * a gameweek for them, so they never show up in the squads. */
export function passedThrough(element: number, trades: Trade[], seasons: Seasons): Hop[] {
  const hops: Hop[] = [];
  for (const t of trades) {
    if (t.state !== "p" || t.event > seasons.lastEvent) continue;
    for (const item of t.tradeitem_set) {
      const recipient = item.element_in === element ? t.offered_entry : item.element_out === element ? t.received_entry : null;
      if (recipient !== null && seasons.ownerAt(element, t.event)?.entryId !== recipient) {
        hops.push({ entryId: recipient, event: t.event });
      }
    }
  }
  return hops.sort((a, b) => a.event - b.event);
}
