import { useMemo } from "react";
import { seasonOdds, squadStrength, type OddsRow } from "../../shared/odds";
import { lastFinishedEvent } from "../../shared/results";
import type { Envelope, Player } from "../../shared/types";
import { useApi } from "./api";
import { Manager } from "./bits";
import type { LeagueData } from "./data";

/** Prizes and forfeits for 2026/27, as agreed in the group chat. `place` is 1-based. */
const PRIZES: { place: number; title: string; what: string; good: boolean }[] = [
  { place: 1, title: "1st", what: "MVP jersey paid by the league and picks the group photo", good: true },
  { place: 2, title: "2nd", what: "Gets the personal assistant", good: true },
  { place: 3, title: "3rd", what: "€40 Classic Football Shirts voucher", good: true },
  { place: 11, title: "11th", what: "Dinner at a 1-star restaurant in your postcode", good: false },
  { place: 12, title: "12th", what: "15 hours in McDonald's", good: false },
  { place: 13, title: "13th", what: "A day of annual leave doing life admin for 2nd place", good: false },
  { place: 14, title: "14th", what: "Walk the whole DART line, Greystones to Howth", good: false },
];

/** Runs the season simulation once per data refresh. */
export function useOdds(data: LeagueData): OddsRow[] {
  return useMemo(() => {
    const squads = new Map<number, Player[]>();
    for (const [playerId, owner] of data.owners) {
      const p = data.players.get(playerId);
      if (owner === null || !p) continue;
      squads.set(owner, [...(squads.get(owner) ?? []), p]);
    }
    const strength = new Map([...squads].map(([id, squad]) => [id, squadStrength(squad)]));
    return seasonOdds(data.league, { strength });
  }, [data.league, data.owners, data.players]);
}

/** Top of the group's main-game FPL league, who is immune from a forfeit. */
function useImmune(data: LeagueData): { entryId: number | null; name: string; total: number } | null {
  const classic = useApi<Envelope<{ standings: { name: string; rank: number; total: number }[] }>>("/api/classic", 1800);
  if (classic.status !== "ready") return null;
  const top = classic.value.data.standings.find((r) => r.rank === 1);
  if (!top) return null;
  const key = (s: string) => s.trim().toLowerCase();
  const match = [...data.entries.values()].find(
    (e) => key(`${e.player_first_name} ${e.player_last_name}`) === key(top.name),
  );
  return { entryId: match?.entry_id ?? null, name: top.name, total: top.total };
}

export function pct(p: number): string {
  if (p === 0) return "0%";
  if (p < 0.005) return "<1%";
  if (p > 0.995 && p < 1) return ">99%";
  return `${Math.round(p * 100)}%`;
}

const sumPlaces = (o: OddsRow, from: number, to: number) => o.places.slice(from - 1, to).reduce((a, b) => a + b, 0);
const avgFinish = (o: OddsRow) => o.places.reduce((a, p, i) => a + p * (i + 1), 0);

export function OddsView({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const odds = useOdds(data);
  const immune = useImmune(data);
  const last = lastFinishedEvent(data.league);
  const stop = data.league.league.stop_event;
  const sorted = [...odds].sort((a, b) => avgFinish(a) - avgFinish(b));
  const top3 = (get: (o: OddsRow) => number) =>
    [...odds].sort((a, b) => get(b) - get(a)).filter((o) => get(o) > 0).slice(0, 3);
  const lowestWeeks = [...odds].filter((o) => o.worstWeek !== null).sort((a, b) => a.worstWeek! - b.worstWeek!);

  const Likely = ({ get }: { get: (o: OddsRow) => number }) => (
    <span>
      {top3(get).map((o, i) => (
        <span key={o.entryId}>
          {i > 0 && ", "}
          <Manager id={o.entryId} data={data} mine={myTeam} /> {pct(get(o))}
        </span>
      ))}
    </span>
  );

  return (
    <>
      <section>
        <h2>Season odds</h2>
        <p className="hint">
          We play the rest of the season ({stop - last} gameweeks) 10,000 times and count where everyone ends up. Each
          manager's likely weekly score mixes what they've scored so far with how strong their squad looks now, so a
          good trade moves the odds straight away. Early in the season it leans on the squad; later on, results take
          over. Updates whenever the league data does.
        </p>
        {immune && (
          <p className="notice">
            Immune from a forfeit right now:{" "}
            {immune.entryId ? <Manager id={immune.entryId} data={data} mine={myTeam} /> : immune.name}, top of the
            regular FPL league on {immune.total} points.
          </p>
        )}
      </section>

      <section>
        <h2>Prizes and forfeits</h2>
        <p className="hint">Most likely to land each one.</p>
        <ul className="plain odds-prizes">
          {PRIZES.map((p) => (
            <li key={p.place} className="card">
              <div className={p.good ? "pts-pos strong" : "pts-neg strong"}>{p.title}</div>
              <div className="hint">{p.what}</div>
              <Likely get={(o) => o.places[p.place - 1]} />
            </li>
          ))}
          <li className="card">
            <div className="pts-neg strong">Lowest total points</div>
            <div className="hint">A selfie every day for the time lapse</div>
            <Likely get={(o) => o.lowestTotal} />
          </li>
          <li className="card">
            <div className="pts-neg strong">Two lowest gameweek scores</div>
            <div className="hint">
              Cook a three-course meal. Worst weeks so far:{" "}
              {lowestWeeks.slice(0, 2).map((o, i) => (
                <span key={o.entryId}>
                  {i > 0 && ", "}
                  {data.labels.get(o.entryId)} {o.worstWeek}
                </span>
              ))}
              .
            </div>
            <Likely get={(o) => o.lowestWeek} />
          </li>
        </ul>
      </section>

      <section>
        <h2>Everyone</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="left">Manager</th>
                <th className="num">Title</th>
                <th className="num">Top 3</th>
                <th className="num">Bottom 4</th>
                <th className="num">Last</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((o) => (
                <tr key={o.entryId} className={o.entryId === myTeam ? "mine" : undefined}>
                  <td className="left">
                    <Manager id={o.entryId} data={data} />
                  </td>
                  <td className="num strong">{pct(o.places[0])}</td>
                  <td className="num">{pct(sumPlaces(o, 1, 3))}</td>
                  <td className="num">{pct(sumPlaces(o, 11, 14))}</td>
                  <td className="num">{pct(o.places[13])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Bottom 4 is 11th to 14th, the forfeit places. The odds are a guide, not a promise: with this many weeks left
          they stay fairly open, and they'll sharpen as the season goes on.
        </p>
      </section>
    </>
  );
}

/** The odds block on a manager's own page. */
export function ManagerOdds({ id, data }: { id: number; data: LeagueData }) {
  const odds = useOdds(data).find((o) => o.entryId === id);
  if (!odds) return null;
  return (
    <section>
      <h2>Season odds</h2>
      <div className="stat-row">
        <OddsStat label="Title" p={odds.places[0]} />
        <OddsStat label="Top 3" p={sumPlaces(odds, 1, 3)} />
        <OddsStat label="Bottom 4" p={sumPlaces(odds, 11, 14)} />
        <OddsStat label="Last" p={odds.places[13]} />
        <OddsStat label="Selfies" p={odds.lowestTotal} />
        <OddsStat label="Cooking" p={odds.lowestWeek} />
      </div>
      <p className="hint">
        <a href="#/league/odds">How this works, and everyone's odds</a>
      </p>
    </section>
  );
}

function OddsStat({ label, p }: { label: string; p: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{pct(p)}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
