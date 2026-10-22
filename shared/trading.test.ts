import { describe, expect, it } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import elementStatus from "../fixtures/element-status.json";
import { trimPlayers } from "../worker/index";
import {
  allRatings,
  bestSwap,
  bestXI,
  compareSwaps,
  isLikeForLike,
  leagueStrength,
  POSITIONS,
  squadsByEntry,
  tradeEffect,
  tradePartners,
  typicalShape,
  type Position,
} from "./trading";
import type { Player, PlayersPayload } from "./types";
import { isOut, waiverSuggestions } from "./waivers";

const payload = JSON.parse(trimPlayers(JSON.stringify(bootstrap))) as PlayersPayload;
const { players, rules, fixtures } = payload;
const byId = new Map(players.map((p) => [p.id, p]));
const owners = new Map(
  (elementStatus as { element_status: { element: number; owner: number | null }[] }).element_status.map((s) => [s.element, s.owner]),
);
const ratings = allRatings(players, fixtures);
const squads = squadsByEntry(players, owners);
const strength = leagueStrength(squads, ratings, rules);
const ADAM = 1412;
const rate = (ids: number[]) => Math.round(ids.reduce((s, id) => s + ratings.get(id)!, 0) * 10) / 10;
const count = (ids: number[], pos: Position) => ids.filter((id) => byId.get(id)!.position === pos).length;

/** Every valid XI from a squad, the slow way, for checking bestXI. */
function bruteForceBest(squad: Player[]): number {
  let best = 0;
  const n = squad.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const picked = squad.filter((_, i) => mask & (1 << i));
    if (picked.length !== rules.play) continue;
    const ids = picked.map((p) => p.id);
    if (POSITIONS.some((pos) => count(ids, pos) < rules.minPlay[pos] || count(ids, pos) > rules.maxPlay[pos])) continue;
    best = Math.max(best, rate(ids));
  }
  return best;
}

describe("ratings", () => {
  it("are the same numbers as the waiver suggestions", () => {
    for (const s of waiverSuggestions(players, owners, fixtures)) expect(ratings.get(s.player.id)).toBe(s.rating);
  });
  it("are 0 for anyone who's out", () => {
    for (const p of players.filter(isOut)) expect(ratings.get(p.id)).toBe(0);
  });
});

describe("bestXI", () => {
  it("gives all 14 squads a valid XI of 11", () => {
    expect(squads.size).toBe(14);
    for (const squad of squads.values()) {
      expect(squad).toHaveLength(15);
      const xi = bestXI(squad, ratings, rules);
      expect(xi.ids).toHaveLength(11);
      for (const pos of POSITIONS) {
        expect(count(xi.ids, pos)).toBeGreaterThanOrEqual(rules.minPlay[pos]);
        expect(count(xi.ids, pos)).toBeLessThanOrEqual(rules.maxPlay[pos]);
      }
      expect(xi.total).toBe(rate(xi.ids));
    }
  });
  it("finds the highest total of any valid XI", () => {
    // Every 11 from 15 (1,365 of them) for two real squads.
    for (const squad of [...squads.values()].slice(0, 2)) expect(bestXI(squad, ratings, rules).total).toBe(bruteForceBest(squad));
  });
});

describe("tradeEffect", () => {
  const mine = squads.get(ADAM)!;
  const [otherId, theirs] = [...squads].find(([id]) => id !== ADAM)!;
  const xi = bestXI(mine, ratings, rules);
  const benchDef = mine.find((p) => p.position === "DEF" && !xi.ids.includes(p.id))!;

  it("knows like for like when it sees it", () => {
    const mid = theirs.find((p) => p.position === "MID")!;
    const def = theirs.find((p) => p.position === "DEF")!;
    expect(isLikeForLike([benchDef], [def])).toBe(true);
    expect(isLikeForLike([benchDef], [mid])).toBe(false);
    expect(isLikeForLike([benchDef], [])).toBe(false);
  });

  it("costs nothing to send a bench player for a worse one", () => {
    const worse = theirs.find((p) => p.position === "DEF" && ratings.get(p.id)! <= ratings.get(benchDef.id)!);
    expect(otherId).not.toBe(ADAM);
    if (!worse) return;
    const effect = tradeEffect(mine, theirs, [benchDef], [worse], ratings, rules);
    expect(effect.likeForLike).toBe(true);
    expect(effect.mine.change).toBe(0);
    expect(effect.mine.joins).toEqual([]);
  });

  it("can lose rating and still improve the XI", () => {
    // Made-up squads: Adam is deep in midfield and thin at the back, Ben the other way round.
    let id = 100_000;
    const ratingsOf = new Map<number, number>();
    const squad = (shape: Record<Position, number[]>) =>
      POSITIONS.flatMap((position) =>
        shape[position].map((r) => {
          ratingsOf.set(++id, r);
          return { ...players[0], id, position, totalPoints: 0 };
        }),
      );
    const adam = squad({ GKP: [5, 1], DEF: [3, 3, 3, 1, 1], MID: [6, 6, 6, 6, 5], FWD: [6, 6, 6] });
    const ben = squad({ GKP: [5, 1], DEF: [6, 6, 6, 6, 6], MID: [2, 2, 2, 1, 1], FWD: [3, 3, 1] });
    // Adam's bench midfielder (5) and a starting defender (3) for one of Ben's defenders (6) and a midfielder (1).
    const give = [adam.find((p) => ratingsOf.get(p.id) === 5 && p.position === "MID")!, adam.find((p) => p.position === "DEF")!];
    const get = [ben.find((p) => p.position === "DEF")!, ben.find((p) => ratingsOf.get(p.id) === 1 && p.position === "MID")!];
    const effect = tradeEffect(adam, ben, give, get, ratingsOf, rules);
    expect(effect.likeForLike).toBe(true);
    expect(effect.mine.change).toBe(3);
    expect(effect.theirs.change).toBe(0);
    expect(effect.mine.joins).toEqual([get[0].id]);
    expect(effect.mine.leaves).toEqual([give[1].id]);
  });

  it("changes nothing when nothing moves", () => {
    const effect = tradeEffect(mine, theirs, [], [], ratings, rules);
    expect(effect.mine.change).toBe(0);
    expect(effect.theirs.change).toBe(0);
    expect(effect.mine.joins).toEqual([]);
  });
});

describe("leagueStrength", () => {
  it("compares a 1-4-4-2 in every squad", () => {
    expect(typicalShape(rules)).toEqual({ GKP: 1, DEF: 4, MID: 4, FWD: 2 });
  });
  it("ranks every position 1 (strongest) to 14", () => {
    for (const pos of POSITIONS) {
      const ranks = strength.map((s) => s.positions[pos].rank);
      expect(Math.min(...ranks)).toBe(1);
      expect(Math.max(...ranks)).toBeLessThanOrEqual(14);
      const top = strength.find((s) => s.positions[pos].rank === 1)!;
      expect(top.positions[pos].rating).toBe(Math.max(...strength.map((s) => s.positions[pos].rating)));
    }
  });
  it("puts everyone not in the best XI on the bench", () => {
    for (const s of strength) {
      expect(s.bench).toHaveLength(4);
      expect(s.bench.some((id) => s.xi.ids.includes(id))).toBe(false);
    }
  });
});

describe("bestSwap", () => {
  const mine = squads.get(ADAM)!;
  const others = [...squads].filter(([id]) => id !== ADAM);

  it("reports the same XI changes as the trade checker", () => {
    for (const [, theirs] of others) {
      const swap = bestSwap(mine, theirs, ratings, rules);
      if (!swap) continue;
      const effect = tradeEffect(mine, theirs, swap.give.map((id) => byId.get(id)!), swap.get.map((id) => byId.get(id)!), ratings, rules);
      expect(effect.likeForLike).toBe(true);
      expect(swap.mine).toBe(effect.mine.change);
      expect(swap.theirs).toBe(effect.theirs.change);
    }
  });

  it("finds the best 1-for-1 or 2-for-2 there is", () => {
    // Check one pair the slow way, through tradeEffect.
    const [, theirs] = others[0];
    const fit = (squad: Player[]) => squad.filter((p) => !isOut(p));
    const found = bestSwap(mine, theirs, ratings, rules);
    const pairs = <T,>(list: T[]) => list.flatMap((x, i) => list.slice(i + 1).map((y) => [x, y]));
    const options = [
      ...fit(mine).flatMap((x) => fit(theirs).map((y) => [[x], [y]])),
      ...pairs(fit(mine)).flatMap((x) => pairs(fit(theirs)).map((y) => [x, y])),
    ].filter(([give, get]) => isLikeForLike(give, get));
    for (const [give, get] of options) {
      const e = tradeEffect(mine, theirs, give, get, ratings, rules);
      if (e.mine.change < 0.1) continue;
      const swap = { give: give.map((p) => p.id), get: get.map((p) => p.id), mine: e.mine.change, theirs: e.theirs.change };
      expect(found).not.toBeNull();
      expect(compareSwaps(swap, found!)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("tradePartners", () => {
  const partners = tradePartners(ADAM, squads, strength, ratings, rules);

  it("lists up to five other managers, best first", () => {
    expect(partners.length).toBeGreaterThan(0);
    expect(partners.length).toBeLessThanOrEqual(5);
    expect(partners.some((p) => p.entryId === ADAM)).toBe(false);
    for (let i = 1; i < partners.length; i++) expect(compareSwaps(partners[i - 1].swap, partners[i].swap)).toBeLessThanOrEqual(0);
  });

  it("only swaps fit players the two of them own, like for like, and always helps the viewer", () => {
    for (const p of partners) {
      const give = p.swap.give.map((id) => byId.get(id)!);
      const get = p.swap.get.map((id) => byId.get(id)!);
      expect(give.every((x) => owners.get(x.id) === ADAM && !isOut(x))).toBe(true);
      expect(get.every((x) => owners.get(x.id) === p.entryId && !isOut(x))).toBe(true);
      expect(isLikeForLike(give, get)).toBe(true);
      expect(p.swap.mine).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("says where each partner is stronger, by league rank", () => {
    const me = strength.find((s) => s.entryId === ADAM)!;
    for (const p of partners) {
      const them = strength.find((s) => s.entryId === p.entryId)!;
      if (p.theyHave) expect(them.positions[p.theyHave].rank).toBeLessThan(me.positions[p.theyHave].rank);
      if (p.youHave) expect(me.positions[p.youHave].rank).toBeLessThan(them.positions[p.youHave].rank);
    }
  });
});
