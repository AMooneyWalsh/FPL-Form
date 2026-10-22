import { useMemo, useState } from "react";
import { countdown, nextDeadline } from "../../shared/deadlines";
import { waiverBattles, waiverRecord, type WaiverBattle } from "../../shared/moves";
import { lastFinishedEvent } from "../../shared/results";
import { freeAgentSignings } from "../../shared/waivers";
import { Explainer, FoldSection, Manager, nobody, PlayerName, RowNo, ScrollTable, SectionHead, ShowFilter, useShownManager } from "./bits";
import type { LeagueData } from "./data";
import { deadlineTime } from "./format";

export function WaiversPage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const [who, setWho] = useShownManager();
  const record = useMemo(() => waiverRecord(data.transactions, data.seasons, [...data.entries.keys()]), [data]);
  const battles = useMemo(() => waiverBattles(data.transactions, data.seasons), [data]);
  const shown = who === null ? battles : battles.filter((b) => b.claims.some((c) => c.entryId === who));
  const byGw = groupBy(shown, (b) => b.event);
  const signings = useMemo(() => freeAgentSignings(data.transactions, data.seasons), [data]);
  const mySignings = who === null ? signings : signings.filter((f) => f.entryId === who);
  const [allSignings, setAllSignings] = useState(false);

  return (
    <>
      <WaiverOrder data={data} myTeam={myTeam} />

      <section>
        <h2>Waiver record</h2>
        <p className="hint">
          Pick-up points are what everyone they've signed (waivers and free agents) has scored in their starting XI.
        </p>
        <ScrollTable>
          <table className="data">
            <thead>
              <tr>
                <th className="left">Manager</th>
                <th className="num">Pick-up pts</th>
                <th className="num">Claims won</th>
                <th className="num">Lost out</th>
                <th className="num">Free agents</th>
              </tr>
            </thead>
            <tbody>
              {record.map((r) => (
                <tr key={r.entryId} className={r.entryId === myTeam ? "mine" : undefined}>
                  <td className="left">
                    <Manager id={r.entryId} data={data} />
                  </td>
                  <td className="num strong">{r.pickupPoints}</td>
                  <td className="num">
                    {r.won}
                    <span className="of">/{r.claims}</span>
                  </td>
                  <td className="num">{r.outbid}</td>
                  <td className="num">{r.freeAgents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </section>

      <section>
        <SectionHead title="Free agent signings">
          <ShowFilter data={data} value={who} onChange={setWho} myTeam={myTeam} />
        </SectionHead>
        <p className="hint">Players picked up without a waiver claim, newest first, and what they've scored since.</p>
        {mySignings.length === 0 && (
          <p className="notice">
            {who === null ? "No free agent signings yet." : nobody(data, who, myTeam, "signed a free agent")}
          </p>
        )}
        <ul className="plain facts">
          {(allSignings ? mySignings : mySignings.slice(0, 10)).map((f) => (
            <li key={f.id} className={f.entryId === myTeam ? "is-mine" : undefined}>
              <div>
                <Manager id={f.entryId} data={data} /> signed <PlayerName id={f.elementIn} data={data} />
              </div>
              <div className="player-meta">
                GW{f.event} · dropped <PlayerName id={f.elementOut} data={data} detail={false} /> ·{" "}
                <strong>{f.points} pts</strong> since{!f.stillOwned && " (let go again)"}
              </div>
            </li>
          ))}
        </ul>
        {mySignings.length > 10 && (
          <button className="link" onClick={() => setAllSignings((v) => !v)}>
            {allSignings ? "Show fewer" : `Show all ${mySignings.length}`}
          </button>
        )}
      </section>

      <section>
        <SectionHead title="Waiver battles">
          <ShowFilter data={data} value={who} onChange={setWho} myTeam={myTeam} />
        </SectionHead>
        <p className="hint">Players more than one manager claimed. Winner first, then in waiver order.</p>
        <Explainer>
          <p>
            "Void" means the claim didn't count because the player that manager meant to drop had already gone in an
            earlier claim.
          </p>
        </Explainer>
        {shown.length === 0 && (
          <p className="notice">
            {who === null ? "No waiver battles yet this season." : nobody(data, who, myTeam, "been in a waiver battle")}
          </p>
        )}
        {[...byGw.entries()].map(([gw, list], i) => (
          <FoldSection key={gw} title={`Gameweek ${gw}`} count={`${list.length} ${list.length === 1 ? "battle" : "battles"}`} open={i === 0}>
            {list.map((b) => (
              <Battle key={`${b.event}-${b.element}`} b={b} data={data} myTeam={myTeam} />
            ))}
          </FoldSection>
        ))}
      </section>
    </>
  );
}

/** FPL's waiver order (`waiver_pick` on each league entry), first in line at the top. */
function WaiverOrder({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const order = [...data.league.league_entries].sort((a, b) => a.waiver_pick - b.waiver_pick);
  const now = Date.now();
  const next = nextDeadline(data.deadlines, "waivers", now);
  const closes = next && `${deadlineTime(next.at, now)} (${countdown(next.at, now)})`;
  // GWn's waivers go by the table after GWn-1, so the order can still change before they close.
  const settled = next !== null && lastFinishedEvent(data.league) >= next.event - 1;
  return (
    <section>
      <h2>Waiver order</h2>
      <p className="hint">
        {!next
          ? "The order as FPL has it."
          : settled
            ? `For the GW${next.event} waivers, which close ${closes}.`
            : `Reshuffled when GW${next.event - 1} finishes, before the GW${next.event} waivers close ${closes}.`}
      </p>
      <ol className="plain waiver-order" style={{ gridTemplateRows: `repeat(${Math.ceil(order.length / 2)}, auto)` }}>
        {order.map((e) => (
          <li key={e.entry_id} className={e.entry_id === myTeam ? "is-mine" : undefined}>
            <RowNo>{e.waiver_pick}</RowNo>
            <Manager id={e.entry_id} data={data} mine={myTeam} />
          </li>
        ))}
      </ol>
      <Explainer>
        <p>
          FPL sets this: bottom of the league table goes first and the top goes last, reshuffled after every gameweek.
          When two managers claim the same player, whoever is higher up usually gets him.
        </p>
      </Explainer>
    </section>
  );
}

/** One player more than one manager claimed. `withEvent` adds the gameweek, for lists that aren't grouped by it. */
export function Battle({
  b,
  data,
  myTeam,
  withEvent = false,
}: {
  b: WaiverBattle;
  data: LeagueData;
  myTeam: number | null;
  withEvent?: boolean;
}) {
  return (
    <article className="card battle">
      <div className="battle-head">
        <PlayerName id={b.element} data={data} />
        {(b.winner !== null || withEvent) && (
          <span className="battle-pts">
            {withEvent && `GW${b.event}`}
            {withEvent && b.winner !== null && " · "}
            {b.winner !== null && `${b.winnerPoints} pts for ${data.labels.get(b.winner)}`}
            {b.winner !== null && !b.stillOwned && data.seasons.lastEvent >= b.event && " (since dropped)"}
          </span>
        )}
      </div>
      <div className="claims">
        {b.claims.map((c) => (
          <span key={c.entryId} className={`claim ${c.result === "a" ? "won" : ""} ${c.entryId === myTeam ? "is-mine" : ""}`}>
            <Manager id={c.entryId} data={data} />
            {c.result === "do" && <span className="claim-why"> (void)</span>}
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
