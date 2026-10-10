import { describe, expect, it } from "vitest";
import bootstrap from "../fixtures/bootstrap-static.json";
import live5 from "../fixtures/event-5-live.json";
import gw5Picks from "../fixtures/gw5-picks.json";
import leagueJson from "../fixtures/league-634-details.json";
import { trimPlayers } from "../worker/index";
import {
  bonusFromBps,
  bonusTable,
  defconTable,
  fixtureImpacts,
  leagueOwners,
  liveMatches,
  liveSquad,
  lineupAsPicked,
  liveTable,
  provisionalBonus,
  toLiveGameweek,
  topPerformers,
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
    const beforeSubs = (p: LivePicks): LivePicks => lineupAsPicked(p, info, rules);
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

describe("player stats and points breakdown (GW5)", () => {
  const matches = liveMatches(league, gw, info, rules);
  const all = matches.flatMap((m) => [m.home!, m.away!]).flatMap((sq) => sq.players.map((p) => ({ sq, p })));
  const byId = (id: number) => all.find((x) => x.p.element === id)!.p;

  it("explains every player's points exactly", () => {
    for (const [id, el] of Object.entries(gw.elements)) {
      const sum = el.breakdown.reduce((s, [, , pts]) => s + pts, 0);
      expect(sum, `player ${id}`).toBe(el.points);
    }
  });

  it("keeps only the stats that happened", () => {
    const brobbey = byId(552); // 3 goals, 3 bonus, 17 points
    expect(brobbey.stats).toMatchObject({ minutes: 90, goals_scored: 3 });
    expect(brobbey.stats.yellow_cards).toBeUndefined();
    expect(brobbey.breakdown.find(([stat]) => stat === "goals_scored")).toEqual(["goals_scored", 3, 12]);
    expect(brobbey.breakdown.find(([stat]) => stat === "bonus")![2]).toBe(3);
  });

  it("knows who started, who came on and who went off", () => {
    const tonali = byId(455); // started, 84 minutes
    expect(tonali).toMatchObject({ started: true, cameOn: false, cameOff: true });
    const roefs = byId(529); // started, 90 minutes
    expect(roefs).toMatchObject({ started: true, cameOff: false });
    const jebbison = byId(607); // came off the bench, 15 minutes
    expect(jebbison).toMatchObject({ started: false, cameOn: true, cameOff: false });
    expect(byId(142)).toMatchObject({ started: false, cameOn: false }); // James never played
  });

  it("doesn't mark a player as taken off while his match is still going", () => {
    const midMatch = {
      ...gw,
      fixtures: gw.fixtures.map((f) => ({ ...f, finishedProvisional: false, minutes: 60 })),
    };
    const squad = liveSquad(171050, midMatch, info, rules)!;
    expect(squad.players.every((p) => !p.cameOff)).toBe(true);
  });

  it("adds up points left on the bench", () => {
    for (const { sq } of all) {
      const bench = sq.players.filter((p) => !p.counts).reduce((s, p) => s + p.points, 0);
      expect(sq.benchPoints).toBe(bench);
    }
    // Adam had Kostoulas on the bench for 10 points.
    const adam = matches.flatMap((m) => [m.home!, m.away!]).find((sq) => sq.entryId === 1412)!;
    expect(adam.benchPoints).toBe(10);
  });

  it("finds each match's goals and cards with who did them", () => {
    const f = gw.fixtures.find((x) => x.id === 41)!; // NEW 2-1 HUL... first fixture in the file
    const goals = f.events.goals_scored ?? [];
    expect(goals.reduce((s, g) => s + g.value, 0)).toBe((f.scoreH ?? 0) + (f.scoreA ?? 0) - (f.events.own_goals ?? []).reduce((s, g) => s + g.value, 0));
    expect(goals.every((g) => typeof g.home === "boolean")).toBe(true);
  });
});

describe("league-wide views (GW5)", () => {
  const matches = liveMatches(league, gw, info, rules);

  it("knows the owner of every player in a lineup", () => {
    const owners = leagueOwners(matches);
    expect(owners.size).toBe(14 * 15);
    expect(owners.get(552)).toEqual({ entryId: 171050, counts: true });
    expect(owners.get(35)?.entryId ?? 1).toBeDefined();
  });

  it("lists the best scores in counting XIs and the best stuck on benches", () => {
    const { best, benched } = topPerformers(matches, 5);
    // Brobbey and Semenyo both scored 17, the best of the week.
    expect(best.slice(0, 2).map((p) => p.element).sort()).toEqual([397, 552]);
    expect(best[0]).toMatchObject({ points: 17, counts: true });
    expect(best.every((p, i) => i === 0 || best[i - 1].points >= p.points)).toBe(true);
    expect(benched.every((p) => !p.counts && p.points > 0)).toBe(true);
    expect(benched[0].points).toBeGreaterThanOrEqual(10);
  });

  it("shows each started match's BPS leaders with the bonus FPL gave", () => {
    const table = bonusTable(gw);
    expect(table).toHaveLength(10);
    for (const { fixture, rows } of table) {
      expect(rows.length).toBeGreaterThanOrEqual(8);
      expect(rows.every((r, i) => i === 0 || rows[i - 1].bps >= r.bps)).toBe(true);
      for (const r of rows) expect(r.bonus, `fixture ${fixture.id} player ${r.element}`).toBe(gw.elements[r.element]?.bonus ?? 0);
    }
  });

  it("shows nothing for matches that haven't started", () => {
    const notStarted = { ...gw, fixtures: gw.fixtures.map((f) => ({ ...f, started: false })) };
    expect(bonusTable(notStarted).every((t) => t.rows.length === 0)).toBe(true);
  });
});

describe("lineups as the manager set them", () => {
  it("puts subbed-off starters back in the XI and subs back on the bench", () => {
    for (const [entryId, p] of Object.entries(picks)) {
      if (p.subs.length === 0) continue;
      const squad = liveSquad(Number(entryId), gw, info, rules)!;
      for (const s of p.subs) {
        const out = squad.players.find((x) => x.element === s.element_out)!;
        const inn = squad.players.find((x) => x.element === s.element_in)!;
        expect(out.slot).toBeLessThanOrEqual(rules.play);
        expect(inn.slot).toBeGreaterThan(rules.play);
        expect(out.subFor).toBe(inn.element);
        expect(inn.counts && !out.counts).toBe(true);
      }
      expect(squad.players.filter((x) => x.counts)).toHaveLength(rules.play);
    }
  });
});

describe("defconTable", () => {
  const fixture = { id: 1, kickoff: null, started: true, finished: false, finishedProvisional: false, minutes: 50, teamH: 1, teamA: 2, scoreH: 0, scoreA: 0, bonusConfirmed: false, bps: [], events: {} };
  const el = (dc: number) => ({ minutes: 50, points: 2, bonus: 0, bps: 10, starts: 1, stats: { defensive_contribution: dc }, breakdown: [] });
  const gw = {
    event: 6,
    fixtures: [fixture, { ...fixture, id: 2, teamH: 3, teamA: 4, started: false }],
    elements: { 10: el(11), 11: el(8), 12: el(6), 13: el(12), 14: el(9), 15: el(14) },
    picks: {},
  } as unknown as Parameters<typeof defconTable>[0];
  const info = new Map([
    [10, { position: "DEF", teamId: 1 }], // earned (11/10)
    [11, { position: "DEF", teamId: 2 }], // close (8/10)
    [12, { position: "DEF", teamId: 1 }], // too far (6/10)
    [13, { position: "MID", teamId: 2 }], // earned (12/12)
    [14, { position: "FWD", teamId: 1 }], // close (9/12)
    [15, { position: "GKP", teamId: 1 }], // keepers can't earn it
  ] as const) as unknown as Map<number, { position: "GKP" | "DEF" | "MID" | "FWD"; teamId: number }>;

  it("lists who has earned it, then who is close, per started match", () => {
    const t = defconTable(gw, info, { GKP: 0, DEF: 10, MID: 12, FWD: 12 });
    expect([...t.keys()]).toEqual([1]);
    expect(t.get(1)!.map((r) => [r.element, r.value, r.limit, r.earned])).toEqual([
      [10, 11, 10, true],
      [13, 12, 12, true],
      [11, 8, 10, false],
      [14, 9, 12, false],
    ]);
  });
});

describe("fixtureImpacts", () => {
  const f = {
    id: 1, kickoff: null, started: true, finished: false, finishedProvisional: false, minutes: 60, teamH: 1, teamA: 2,
    scoreH: 1, scoreA: 1, bonusConfirmed: false,
    bps: [{ element: 10, value: 40 }, { element: 20, value: 30 }, { element: 11, value: 20 }, { element: 21, value: 5 }],
    events: {
      goals_scored: [{ element: 10, value: 1, home: true }, { element: 20, value: 1, home: false }],
      assists: [{ element: 11, value: 1, home: true }],
      yellow_cards: [{ element: 21, value: 1, home: false }],
    },
  };
  const el = (points: number, dc = 0) => ({ minutes: 60, points, bonus: 0, bps: 0, starts: 1, stats: { defensive_contribution: dc }, breakdown: [] });
  const gw = { event: 6, fixtures: [f], elements: { 10: el(6), 11: el(3), 20: el(5), 21: el(1), 22: el(4, 11) }, picks: {} } as unknown as Parameters<typeof fixtureImpacts>[1];
  const info = new Map([
    [10, { position: "MID", teamId: 1 }], [11, { position: "FWD", teamId: 1 }],
    [20, { position: "FWD", teamId: 2 }], [21, { position: "DEF", teamId: 2 }], [22, { position: "DEF", teamId: 2 }],
  ]) as unknown as Map<number, { position: "GKP" | "DEF" | "MID" | "FWD"; teamId: number }>;

  it("splits by side, adds provisional bonus and DefCon, best first", () => {
    const r = fixtureImpacts(f as never, gw, info, { GKP: 0, DEF: 10, MID: 12, FWD: 12 });
    expect(r.home.map((i) => [i.element, i.goals, i.assists, i.bonus, i.points])).toEqual([
      [10, 1, 0, 3, 9],
      [11, 0, 1, 1, 4],
    ]);
    expect(r.away.map((i) => [i.element, i.goals, i.yellow, i.bonus, i.defcon, i.points])).toEqual([
      [20, 1, 0, 2, false, 7],
      [22, 0, 0, 0, true, 4],
      [21, 0, 1, 0, false, 1],
    ]);
    expect(r.home[0].bonusProvisional).toBe(true);
  });
});
