// Trade tools: best starting XIs, how strong each squad is in each position,
// and swaps worth offering. Every number is built on playerRating (the waiver
// suggestion rating) with FPL's pre-season draft rank mixed in early in the
// season. See docs/trade-tools.md.
import type { Player, SquadRules, UpcomingFixture } from "./types";
import { clubDifficulty, isOut, playerRating } from "./waivers";

export type Position = Player["position"];
export const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];

/**
 * Every player's trade rating, keyed by id. Work it out once per page and
 * share it. `gameweeks` is how many have been played (for tradeBase).
 */
export function allRatings(players: Player[], fixtures: UpcomingFixture[], gameweeks: number): Map<number, number> {
  const difficulty = clubDifficulty(players);
  const curve = draftRankCurve(players);
  return new Map(players.map((p) => [p.id, playerRating(p, fixtures, difficulty, tradeBase(p, curve, gameweeks))]));
}

// ---------------------------------------------------------------- draft rank
//
// Early on, a few good or bad games say little; FPL's pre-season draft rank
// still knows who the good players are. So a trade rating mixes the two, and
// the draft rank fades as the games pile up.

/** How many starts a draft rank is worth: after 4 starts, his own points count twice as much as where he was ranked, and so on. */
export const DRAFT_RANK_STARTS = 4;
/** Players with fewer starts than this are left out of fitting the curve. */
const CURVE_MIN_STARTS = 3;

/**
 * Points a game a player at each draft rank is scoring this season:
 * a + b × ln(rank), fitted to the regular starters (weighted by starts). Refits
 * itself every time, so it follows the season. Flat at the average when
 * there's too little to fit.
 */
export function draftRankCurve(players: Player[]): (rank: number) => number {
  const regulars = players.filter((p) => p.starts >= CURVE_MIN_STARTS && p.draftRank > 0);
  const total = regulars.reduce((s, p) => s + p.starts, 0);
  if (regulars.length < 10) {
    const avg = total ? regulars.reduce((s, p) => s + p.starts * p.pointsPerGame, 0) / total : 0;
    return () => avg;
  }
  const mx = regulars.reduce((s, p) => s + p.starts * Math.log(p.draftRank), 0) / total;
  const my = regulars.reduce((s, p) => s + p.starts * p.pointsPerGame, 0) / total;
  let sxy = 0;
  let sxx = 0;
  for (const p of regulars) {
    const dx = Math.log(p.draftRank) - mx;
    sxy += p.starts * dx * (p.pointsPerGame - my);
    sxx += p.starts * dx * dx;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return (rank) => Math.max(0, my + b * (Math.log(Math.max(1, rank)) - mx));
}

/**
 * Points a game before fixtures and fitness, for the trade tools: his own
 * numbers (60% form, 40% points a game) mixed with what his draft rank says,
 * weighted DRAFT_RANK_STARTS : starts. The draft rank's say is cut by the
 * share of minutes he's played, so a highly ranked player who isn't getting
 * games is judged on his own (empty) numbers, and one who has just broken
 * into the team keeps his form.
 */
export function tradeBase(p: Player, curve: (rank: number) => number, gameweeks: number): number {
  const own = 0.6 * p.form + 0.4 * p.pointsPerGame;
  const playing = gameweeks > 0 ? Math.min(1, p.minutes / (90 * gameweeks)) : 1;
  const w = (DRAFT_RANK_STARTS / (DRAFT_RANK_STARTS + p.starts)) * playing;
  return (1 - w) * own + w * curve(p.draftRank);
}

/** Each manager's current squad (from ownership), keyed by entry_id. */
export function squadsByEntry(players: Player[], owners: Map<number, number | null>): Map<number, Player[]> {
  const squads = new Map<number, Player[]>();
  for (const p of players) {
    const owner = owners.get(p.id) ?? null;
    if (owner === null) continue;
    const list = squads.get(owner) ?? [];
    list.push(p);
    squads.set(owner, list);
  }
  return squads;
}

/** One decimal place, so totals match the ratings on screen. */
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- best XI

interface Rated {
  player: Player;
  rating: number;
}

/** Best rating first; ties go to season points, then id, so the same squad always gives the same XI. */
const byRating = (a: Rated, b: Rated) =>
  b.rating - a.rating || b.player.totalPoints - a.player.totalPoints || a.player.id - b.player.id;

/** A squad split by position, best first in each. */
type ByPosition = Record<Position, Rated[]>;

function byPosition(squad: Player[], ratings: Map<number, number>): ByPosition {
  const out: ByPosition = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of squad) out[p.position].push({ player: p, rating: ratings.get(p.id) ?? 0 });
  for (const pos of POSITIONS) out[pos].sort(byRating);
  return out;
}

// The XI maths works on plain arrays in POSITIONS order (keepers, defenders,
// midfielders, forwards), because the swap search runs it ~40,000 times.

/** How many start in each position, e.g. [1, 4, 4, 2]. */
type Shape = number[];

/** Every formation the rules allow: 1 keeper, 3-5 defenders, 2-5 midfielders, 1-3 forwards, 11 in all. */
function formations(rules: SquadRules): Shape[] {
  const out: Shape[] = [];
  const walk = (shape: Shape, left: number) => {
    if (shape.length === POSITIONS.length) {
      if (left === 0) out.push(shape);
      return;
    }
    const pos = POSITIONS[shape.length];
    for (let n = rules.minPlay[pos]; n <= Math.min(rules.maxPlay[pos], left); n++) walk([...shape, n], left - n);
  };
  walk([], rules.play);
  return out;
}

/** Running totals of ratings sorted best first: sums[n] is the best n added up. */
function sumsOf(ratings: number[]): number[] {
  const out = [0];
  for (const r of ratings) out.push(out[out.length - 1] + r);
  return out;
}

/** One position's running totals after the players at places `out` leave and players rated `add` arrive. */
function sumsAfter(list: number[], out: number[], add: number[]): number[] {
  const kept = list.filter((_, i) => !out.includes(i)).concat(add);
  return sumsOf(kept.sort((x, y) => y - x));
}

/**
 * The formation with the highest total, trying every one. Each position's
 * starters are its best players, so a formation's total is just each
 * position's best few added up. A position short of players counts who's there.
 */
function bestShape(sums: number[][], shapes: Shape[]): { shape: Shape; total: number } {
  let best = { shape: shapes[0], total: -1 };
  for (const shape of shapes) {
    let total = 0;
    for (let i = 0; i < shape.length; i++) total += sums[i][Math.min(shape[i], sums[i].length - 1)];
    if (total > best.total + 1e-9) best = { shape, total };
  }
  return { shape: best.shape, total: round1(best.total) };
}

const sumsBy = (squad: ByPosition) => POSITIONS.map((pos) => sumsOf(squad[pos].map((r) => r.rating)));

export interface XI {
  /** Player ids, best rating first. */
  ids: number[];
  /** Their ratings added up. */
  total: number;
}

/** The strongest starting XI a squad can pick within the formation rules, by rating. */
export function bestXI(squad: Player[], ratings: Map<number, number>, rules: SquadRules): XI {
  const split = byPosition(squad, ratings);
  const { shape, total } = bestShape(sumsBy(split), formations(rules));
  const starters = POSITIONS.flatMap((pos, i) => split[pos].slice(0, shape[i])).sort(byRating);
  return { ids: starters.map((r) => r.player.id), total };
}

// ---------------------------------------------------------------- one trade

export interface XIChange {
  before: XI;
  after: XI;
  /** after - before. */
  change: number;
  /** Who gets into the XI, and who drops out of it. */
  joins: number[];
  leaves: number[];
}

export interface TradeEffect {
  /** The same number of each position both ways. FPL only allows trades like this. */
  likeForLike: boolean;
  /** For the manager sending `give`, and for the one sending `get`. */
  mine: XIChange;
  theirs: XIChange;
}

/** How many of each position, e.g. { GKP: 0, DEF: 2, MID: 1, FWD: 0 }. */
export function positionCounts(players: Player[]): Record<Position, number> {
  const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) counts[p.position]++;
  return counts;
}

/** FPL Draft trades must be like for like, so both squads keep their 2-5-5-3 shape. */
export function isLikeForLike(give: Player[], get: Player[]): boolean {
  const a = positionCounts(give);
  const b = positionCounts(get);
  return POSITIONS.every((pos) => a[pos] === b[pos]);
}

function xiChange(squad: Player[], out: Player[], into: Player[], ratings: Map<number, number>, rules: SquadRules): XIChange {
  const gone = new Set(out.map((p) => p.id));
  const before = bestXI(squad, ratings, rules);
  const after = bestXI([...squad.filter((p) => !gone.has(p.id)), ...into], ratings, rules);
  return {
    before,
    after,
    change: round1(after.total - before.total),
    joins: after.ids.filter((id) => !before.ids.includes(id)),
    leaves: before.ids.filter((id) => !after.ids.includes(id)),
  };
}

/** What swapping `give` (from `mine`) for `get` (from `theirs`) does to both best XIs. */
export function tradeEffect(
  mine: Player[],
  theirs: Player[],
  give: Player[],
  get: Player[],
  ratings: Map<number, number>,
  rules: SquadRules,
): TradeEffect {
  return {
    likeForLike: isLikeForLike(give, get),
    mine: xiChange(mine, give, get, ratings, rules),
    theirs: xiChange(theirs, get, give, ratings, rules),
  };
}

// ---------------------------------------------------------------- strength by position

/**
 * How many players a typical XI has in each position: the squad's own shape
 * (2-5-5-3) scaled down to 11, which is 1 keeper, 4 defenders, 4 midfielders
 * and 2 forwards. Comparing the same number of players in every squad is
 * fairer than comparing whoever happens to start.
 */
export function typicalShape(rules: SquadRules): Record<Position, number> {
  const size = POSITIONS.reduce((s, pos) => s + rules.select[pos], 0);
  const shape = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const share = Math.round((rules.play * rules.select[pos]) / size);
    shape[pos] = Math.min(rules.maxPlay[pos], Math.max(rules.minPlay[pos], share));
  }
  return shape;
}

export interface PositionStrength {
  /** Average rating of the squad's best players there (typicalShape of them). */
  rating: number;
  /** 1 = strongest in the league at this position. */
  rank: number;
}

export interface SquadStrength {
  entryId: number;
  xi: XI;
  /** Everyone not in the best XI, best rating first: the players they could most easily spare. */
  bench: number[];
  positions: Record<Position, PositionStrength>;
}

/** Every squad's best XI and strength in each position, ranked against the rest of the league. */
export function leagueStrength(
  squads: Map<number, Player[]>,
  ratings: Map<number, number>,
  rules: SquadRules,
): SquadStrength[] {
  const shape = typicalShape(rules);
  const rows = [...squads].map(([entryId, squad]): SquadStrength => {
    const split = byPosition(squad, ratings);
    const xi = bestXI(squad, ratings, rules);
    const bench = POSITIONS.flatMap((pos) => split[pos])
      .filter((r) => !xi.ids.includes(r.player.id))
      .sort(byRating)
      .map((r) => r.player.id);
    const positions = {} as Record<Position, PositionStrength>;
    for (const pos of POSITIONS) {
      const top = split[pos].slice(0, shape[pos]);
      positions[pos] = { rating: round1(top.reduce((s, r) => s + r.rating, 0) / shape[pos]), rank: 0 };
    }
    return { entryId, xi, bench, positions };
  });
  for (const pos of POSITIONS) {
    for (const row of rows) {
      row.positions[pos].rank = 1 + rows.filter((r) => r.positions[pos].rating > row.positions[pos].rating).length;
    }
  }
  return rows;
}

// ---------------------------------------------------------------- swaps and partners

export interface Swap {
  /** What the viewer sends and gets back: the same positions both ways. */
  give: number[];
  get: number[];
  /** Change in the viewer's best XI, and in the other manager's. */
  mine: number;
  theirs: number;
}

/** Counts as a real change, not rounding. */
const GAIN = 0.1;

/** A player in the swap search: his position (0-3, POSITIONS order) and place in it, best first. */
interface Slot extends Rated {
  p: number;
  i: number;
}

/**
 * Better swaps first. One that helps both XIs beats one that only helps
 * yours. Among those that help both, the fairest (the smaller of the two
 * gains is biggest), as that's the one they're likeliest to say yes to.
 * Among the rest, the one that costs the other manager least, then the
 * most for you. Then fewer players.
 */
export function compareSwaps(a: Swap, b: Swap): number {
  const both = (s: Swap) => s.mine >= GAIN && s.theirs >= GAIN;
  if (both(a) !== both(b)) return both(a) ? -1 : 1;
  const order = both(a)
    ? Math.min(b.mine, b.theirs) - Math.min(a.mine, a.theirs) || b.mine + b.theirs - (a.mine + a.theirs)
    : b.theirs - a.theirs || b.mine - a.mine;
  return order || a.give.length - b.give.length;
}

/**
 * The best like-for-like swap between two squads, from the viewer's side:
 * every 1-for-1 and 2-for-2 that keeps both squads' shape, about 1,500 per
 * pair, so the whole league takes a blink even on a phone. Players who are
 * out aren't offered or asked for: they rate 0, so they'd look like free
 * throw-ins, which nobody would fall for. Null if nothing makes the viewer's
 * XI better.
 */
export function bestSwap(
  mine: Player[],
  theirs: Player[],
  ratings: Map<number, number>,
  rules: SquadRules,
): Swap | null {
  const shapes = formations(rules);
  const slots = (squad: Player[]): Slot[][] => {
    const split = byPosition(squad, ratings);
    return POSITIONS.map((pos, p) => split[pos].map((r, i) => ({ ...r, p, i })));
  };
  const a = slots(mine);
  const b = slots(theirs);
  const listA = a.map((list) => list.map((s) => s.rating));
  const listB = b.map((list) => list.map((s) => s.rating));
  const sumsA = listA.map(sumsOf);
  const sumsB = listB.map(sumsOf);
  const baseA = bestShape(sumsA, shapes).total;
  const baseB = bestShape(sumsB, shapes).total;
  // Every one-for-one within a position, worked out once: a 2-for-2 across two positions is two of these.
  const oneA = a.map((list, p) => list.map((x) => b[p].map((y) => sumsAfter(listA[p], [x.i], [y.rating]))));
  const oneB = b.map((list, p) => list.map((y) => a[p].map((x) => sumsAfter(listB[p], [y.i], [x.rating]))));
  /** A squad's running totals with one or two positions' swapped in. */
  const swapped = (sums: number[][], p1: number, s1: number[], p2 = -1, s2: number[] = []) => {
    const next = sums.slice();
    next[p1] = s1;
    if (p2 >= 0) next[p2] = s2;
    return next;
  };
  let best: Swap | null = null;
  const consider = (give: Slot[], get: Slot[], mineAfter: number[][], theirsAfter: () => number[][]) => {
    const mineChange = round1(bestShape(mineAfter, shapes).total - baseA);
    if (mineChange < GAIN) return;
    const swap: Swap = {
      give: give.map((s) => s.player.id),
      get: get.map((s) => s.player.id),
      mine: mineChange,
      theirs: round1(bestShape(theirsAfter(), shapes).total - baseB),
    };
    if (best === null || compareSwaps(swap, best) < 0) best = swap;
  };
  const offered = a.flat().filter((s) => !isOut(s.player));
  const wanted = b.map((list) => list.filter((s) => !isOut(s.player)));
  for (const x of offered) {
    for (const y of wanted[x.p]) {
      consider([x], [y], swapped(sumsA, x.p, oneA[x.p][x.i][y.i]), () => swapped(sumsB, x.p, oneB[x.p][y.i][x.i]));
    }
  }
  for (let i = 0; i < offered.length; i++) {
    for (let j = i + 1; j < offered.length; j++) {
      const [x1, x2] = [offered[i], offered[j]];
      const [p1, p2] = [x1.p, x2.p];
      if (p1 === p2) {
        // Two from the same position: each pair of theirs there once.
        const there = wanted[p1];
        for (let k = 0; k < there.length; k++) {
          for (let l = k + 1; l < there.length; l++) {
            const [y1, y2] = [there[k], there[l]];
            consider(
              [x1, x2],
              [y1, y2],
              swapped(sumsA, p1, sumsAfter(listA[p1], [x1.i, x2.i], [y1.rating, y2.rating])),
              () => swapped(sumsB, p1, sumsAfter(listB[p1], [y1.i, y2.i], [x1.rating, x2.rating])),
            );
          }
        }
        continue;
      }
      // Two positions: one of theirs from each.
      for (const y1 of wanted[p1]) {
        for (const y2 of wanted[p2]) {
          consider(
            [x1, x2],
            [y1, y2],
            swapped(sumsA, p1, oneA[p1][x1.i][y1.i], p2, oneA[p2][x2.i][y2.i]),
            () => swapped(sumsB, p1, oneB[p1][y1.i][x1.i], p2, oneB[p2][y2.i][x2.i]),
          );
        }
      }
    }
  }
  return best;
}

export interface Partner {
  entryId: number;
  swap: Swap;
  /** Where they're strongest compared with the viewer, and the other way round. Null if nowhere. */
  theyHave: Position | null;
  youHave: Position | null;
}

/**
 * The managers worth trading with: each one's best swap (see bestSwap),
 * ranked with compareSwaps, so the ones where both XIs get better come first.
 * Also says where each is strong and the viewer weak, and the other way
 * round, by league rank in each position.
 */
export function tradePartners(
  entryId: number,
  squads: Map<number, Player[]>,
  strength: SquadStrength[],
  ratings: Map<number, number>,
  rules: SquadRules,
  count = 5,
): Partner[] {
  const mine = squads.get(entryId) ?? [];
  const me = strength.find((s) => s.entryId === entryId);
  if (!me) return [];
  const widest = (them: SquadStrength, sign: 1 | -1): Position | null => {
    let pick: Position | null = null;
    let gap = 0;
    for (const pos of POSITIONS) {
      // A lower rank is stronger, so a positive gap means they're stronger there than the viewer.
      const g = sign * (me.positions[pos].rank - them.positions[pos].rank);
      if (g > gap) [pick, gap] = [pos, g];
    }
    return pick;
  };
  return strength
    .filter((s) => s.entryId !== entryId)
    .flatMap((them): Partner[] => {
      const swap = bestSwap(mine, squads.get(them.entryId) ?? [], ratings, rules);
      return swap ? [{ entryId: them.entryId, swap, theyHave: widest(them, 1), youHave: widest(them, -1) }] : [];
    })
    .sort((x, y) => compareSwaps(x.swap, y.swap))
    .slice(0, count);
}
