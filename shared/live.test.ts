import { describe, expect, it } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import live5 from "../fixtures/event-5-live.json";
import gw5Picks from "../fixtures/gw5-picks.json";
import leagueJson from "../fixtures/league-634-details.json";
import { trimPlayers } from "../worker/index";
import {
  bonusFromBps,
  liveMatches,
  liveSquad,
  liveTable,
  provisionalBonus,
  toLiveGameweek,
  type LivePicks,
  type PlayerInfo,
  type RawLiveResponse,
} from "./live";
import { computeStandings } from "./standings";
import type { LeagueDetails, PlayersPayload } from "./types";

const league = leagueJson as unknown as LeagueDetails;
const raw = live5 as unknown as RawLiveResponse;
const picks = gw5Picks as unknown as Record<number, LivePicks>;
const { players, rules } = JSON.parse(trimPlayers(JSON.stringify(bootstrap))) as PlayersPayload;
const info = new Map<number, PlayerInfo>(players.map((p) => [p.id, { position: p.position, teamId: p.teamId }]));
const toEntry = new Map(league.league_entries.map((e) => [e.id, e.entry_id]));
const gw = toLiveGameweek(5, raw, picks);

/** GW5's real H2H score for each entry_id. */
const realScores = new Map<number, number>();
for (const m of league.matches.filter((m) => m.event === 5)) {
  realScores.set(toEntry.get(m.league_entry_1)!, m.league_entry_1_points);
  realScores.set(toEntry.get(m.league_entry_2)!, m.league_entry_2_points);
}

describe("bonusFromBps", () => {
  const b = (...values: number[]) => bonusFromBps(values.map((value, i) => ({ element: i + 1, value })));

  it("gives 3, 2, 1 to the top three", () => {
    expect([...b(40, 30, 20, 10)]).toEqual([
      [1, 3],
      [2, 2],
      [3, 1],
    ]);
  });

  it("shares first place and skips second", () => {
    expect(Object.fromEntries(b(40, 40, 20, 10))).toEqual({ 1: 3, 2: 3, 3: 1 });
  });

  it("shares second place", () => {
    expect(Object.fromEntries(b(40, 30, 30, 10))).toEqual({ 1: 3, 2: 2, 3: 2 });
  });

  it("shares third place", () => {
    expect(Object.fromEntries(b(40, 30, 20, 20, 5))).toEqual({ 1: 3, 2: 2, 3: 1, 4: 1 });
  });

  it("gives all three a 3 if three tie for first", () => {
    expect(Object.fromEntries(b(40, 40, 40, 10))).toEqual({ 1: 3, 2: 3, 3: 3 });
  });

  it("matches FPL's official bonus for every GW5 match", () => {
    for (const f of raw.fixtures) {
      const official = f.stats.find((s) => s.s === "bonus")!;
      const expected = Object.fromEntries([...official.h, ...official.a].map((x) => [x.element, x.value]));
      const bps = f.stats.find((s) => s.s === "bps")!;
      expect(Object.fromEntries(bonusFromBps([...bps.h, ...bps.a])), `fixture ${f.id}`).toEqual(expected);
    }
  });
});

describe("live scoring on GW5 (finished)", () => {
  it("reproduces every real H2H score using FPL's own subs", () => {
    for (const [entryId, score] of realScores) {
      const squad = liveSquad(entryId, gw, info, rules)!;
      expect(squad.officialSubs || squad.players.every((p) => !p.subbedIn)).toBe(true);
      expect(squad.score, `entry ${entryId}`).toBe(score);
    }
  });

  it("works out the same auto-subs FPL made, without being told", () => {
    // After a gameweek is processed FPL writes the subs into the lineup (the
    // sub moves into the XI slot) and also lists them. Put each lineup back
    // the way it was before the subs, with none listed, as it looks live.
    const beforeSubs = (p: LivePicks): LivePicks => {
      const slot = new Map(p.picks.map((x) => [x.element, x.position]));
      for (const s of p.subs) {
        const a = slot.get(s.element_in)!;
        slot.set(s.element_in, slot.get(s.element_out)!);
        slot.set(s.element_out, a);
      }
      // FPL keeps the XI in position order (GKP, DEF, MID, FWD), so re-sort it.
      const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
      const xi = [...slot.entries()]
        .filter(([, pos]) => pos <= rules.play)
        .sort((a, b) => order[info.get(a[0])!.position] - order[info.get(b[0])!.position] || a[1] - b[1]);
      xi.forEach(([el], i) => slot.set(el, i + 1));
      return { picks: p.picks.map((x) => ({ element: x.element, position: slot.get(x.element)! })), subs: [] };
    };
    const noSubs = toLiveGameweek(
      5,
      raw,
      Object.fromEntries(Object.entries(picks).map(([id, p]) => [id, beforeSubs(p)])),
    );
    let checked = 0;
    for (const [entryId, score] of realScores) {
      const projected = liveSquad(entryId, noSubs, info, rules)!;
      const official = picks[entryId].subs;
      const ins = projected.players.filter((p) => p.subbedIn).map((p) => p.element).sort();
      const outs = projected.players.filter((p) => p.subbedOut);
      expect(ins, `entry ${entryId} subs in`).toEqual(official.map((s) => s.element_in).sort());
      // Which non-playing starter goes off depends on the original lineup
      // order, which FPL doesn't keep once it re-sorts (e.g. Ross had three
      // 0-minute defenders). It can't change the score: they all scored 0.
      expect(outs).toHaveLength(official.length);
      for (const p of outs) expect(p.status, `entry ${entryId} took off ${p.element}`).toBe("did-not-play");
      expect(projected.score, `entry ${entryId}`).toBe(score);
      checked += official.length;
    }
    expect(checked).toBe(10);
  });

  it("adds provisional bonus back if FPL hadn't confirmed it yet", () => {
    // Pretend no bonus had been confirmed: remove it from points and flag the matches.
    const unconfirmed = {
      ...gw,
      elements: Object.fromEntries(
        Object.entries(gw.elements).map(([id, el]) => [id, { ...el, points: el.points - el.bonus, bonus: 0 }]),
      ),
      fixtures: gw.fixtures.map((f) => ({ ...f, bonusConfirmed: false })),
    };
    expect(provisionalBonus(gw).size).toBe(0);
    expect(provisionalBonus(unconfirmed).size).toBeGreaterThan(0);
    for (const [entryId, score] of realScores) {
      expect(liveSquad(entryId, unconfirmed, info, rules)!.score).toBe(score);
    }
  });

  it("marks every counting player as played or did-not-play once games are over", () => {
    const squad = liveSquad(1412, gw, info, rules)!;
    expect(squad.toPlay).toBe(0);
    expect(squad.players.filter((p) => p.counts)).toHaveLength(11);
  });
});

describe("live matches and table", () => {
  const matches = liveMatches(league, gw, info, rules);

  it("builds all 7 GW5 matches", () => {
    expect(matches).toHaveLength(7);
    for (const m of matches) {
      expect(m.home!.score).toBe(realScores.get(m.homeEntry));
      expect(m.away!.score).toBe(realScores.get(m.awayEntry));
    }
  });

  it("gives the real table when the live scores are the final ones", () => {
    const unplayed: LeagueDetails = {
      ...league,
      matches: league.matches.map((m) =>
        m.event === 5 ? { ...m, finished: false, league_entry_1_points: 0, league_entry_2_points: 0 } : m,
      ),
    };
    const live = liveTable(unplayed, 5, matches);
    const real = computeStandings(league);
    expect(live.map((r) => [r.entryId, r.total, r.pointsFor])).toEqual(real.map((r) => [r.entryId, r.total, r.pointsFor]));
  });

  it("shows no squads before the deadline", () => {
    const before = toLiveGameweek(6, { elements: {}, fixtures: [] }, {});
    expect(liveSquad(1412, before, info, rules)).toBeNull();
  });
});
