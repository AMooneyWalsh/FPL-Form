import { useMemo } from "react";
import { waiverBattles, waiverRecord, type WaiverBattle } from "../../shared/moves";
import { Manager, nobody, PlayerName, ShowFilter, useShownManager } from "./bits";
import type { LeagueData } from "./data";

export function WaiversPage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const [who, setWho] = useShownManager();
  const record = useMemo(() => waiverRecord(data.transactions, data.seasons, [...data.entries.keys()]), [data]);
  const battles = useMemo(() => waiverBattles(data.transactions, data.seasons), [data]);
  const shown = who === null ? battles : battles.filter((b) => b.claims.some((c) => c.entryId === who));
  const byGw = groupBy(shown, (b) => b.event);

  return (
    <>
      <section>
        <h2>Waiver record</h2>
        <p className="hint">
          Pick-up points are what everyone they've signed (waivers and free agents) has scored in their starting XI.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="left">Manager</th>
                <th className="num">Won</th>
                <th className="num">Outbid</th>
                <th className="num hide-narrow">Free agents</th>
                <th className="num">Pick-up pts</th>
              </tr>
            </thead>
            <tbody>
              {record.map((r) => (
                <tr key={r.entryId} className={r.entryId === myTeam ? "mine" : undefined}>
                  <td className="left">
                    <Manager id={r.entryId} data={data} />
                  </td>
                  <td className="num">
                    {r.won}
                    <span className="of">/{r.claims}</span>
                  </td>
                  <td className="num">{r.outbid}</td>
                  <td className="num hide-narrow">{r.freeAgents}</td>
                  <td className="num strong">{r.pickupPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Waiver battles</h2>
          <ShowFilter data={data} value={who} onChange={setWho} myTeam={myTeam} />
        </div>
        <p className="hint">Players more than one manager put a claim in for. Winner first, then in priority order.</p>
        {shown.length === 0 && (
          <p className="notice">
            {who === null ? "No waiver battles yet this season." : nobody(data, who, myTeam, "been in a waiver battle")}
          </p>
        )}
        {[...byGw.entries()].map(([gw, list]) => (
          <div key={gw}>
            <h3>Gameweek {gw}</h3>
            {list.map((b) => (
              <Battle key={`${b.event}-${b.element}`} b={b} data={data} myTeam={myTeam} />
            ))}
          </div>
        ))}
      </section>
    </>
  );
}

function Battle({ b, data, myTeam }: { b: WaiverBattle; data: LeagueData; myTeam: number | null }) {
  return (
    <article className="card battle">
      <div className="battle-head">
        <PlayerName id={b.element} data={data} />
        {b.winner !== null && (
          <span className="battle-pts">
            {b.winnerPoints} pts for {data.labels.get(b.winner)}
            {!b.stillOwned && data.seasons.lastEvent >= b.event && " (since dropped)"}
          </span>
        )}
      </div>
      <div className="claims">
        {b.claims.map((c) => (
          <span key={c.entryId} className={`claim ${c.result === "a" ? "won" : ""} ${c.entryId === myTeam ? "is-mine" : ""}`}>
            <Manager id={c.entryId} data={data} />
            {c.result === "do" && <span className="claim-why"> (drop gone)</span>}
          </span>
        ))}
      </div>
    </article>
  );
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}
