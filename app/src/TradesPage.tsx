import { useMemo, useState } from "react";
import { tradeLedger, tradeVerdicts, type TradedPlayer, type TradeSide, type TradeVerdict } from "../../shared/moves";
import { Manager, MineToggle, PlayerName, Pts } from "./bits";
import type { LeagueData } from "./data";

export function TradesPage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const [justMine, setJustMine] = useState(false);
  const verdicts = useMemo(() => tradeVerdicts(data.trades, data.seasons, data.transactions), [data]);
  const ledger = useMemo(() => tradeLedger(verdicts, [...data.entries.keys()]), [verdicts, data]);
  const shown = justMine
    ? verdicts.filter((v) => v.offerer.entryId === myTeam || v.receiver.entryId === myTeam)
    : verdicts;

  return (
    <>
      <section>
        <h2>Who's winning at trading</h2>
        <p className="hint">
          Points the players they traded for have scored for them, minus points the players they gave away have scored
          since. Only points from the starting XI count.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="left">Manager</th>
                <th className="num">Trades</th>
                <th className="num">Won</th>
                <th className="num">Lost</th>
                <th className="num">Net</th>
                <th className="left hide-narrow">Trades most with</th>
              </tr>
            </thead>
            <tbody>
              {ledger
                .filter((r) => r.trades > 0)
                .map((r) => {
                  const partner = [...r.partners.entries()].sort((a, b) => b[1] - a[1])[0];
                  return (
                    <tr key={r.entryId} className={r.entryId === myTeam ? "mine" : undefined}>
                      <td className="left">
                        <Manager id={r.entryId} data={data} />
                      </td>
                      <td className="num">{r.trades}</td>
                      <td className="num">{r.won}</td>
                      <td className="num">{r.lost}</td>
                      <td className="num strong">
                        <Pts n={r.net} signed />
                      </td>
                      <td className="left hide-narrow">
                        {partner && (
                          <>
                            <Manager id={partner[0]} data={data} /> ({partner[1]})
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {ledger.some((r) => r.trades === 0) && (
          <p className="hint">
            No trades yet:{" "}
            {ledger
              .filter((r) => r.trades === 0)
              .map((r) => data.labels.get(r.entryId))
              .join(", ")}
            .
          </p>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Every trade</h2>
          <MineToggle on={justMine} set={setJustMine} />
        </div>
        <p className="hint">
          Big number: what each player was worth to the manager who got him. That's his points in their XI, plus, if
          they traded him on, a share of what they got for him. Small number: all his points since, whoever had him.
        </p>
        {shown.length === 0 && <p className="notice">No trades to show.</p>}
        {shown.map((v) => (
          <TradeCard key={v.id} v={v} data={data} myTeam={myTeam} />
        ))}
      </section>
    </>
  );
}

function TradeCard({ v, data, myTeam }: { v: TradeVerdict; data: LeagueData; myTeam: number | null }) {
  const date = new Date(v.time).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <article className="card" id={`trade-${v.id}`}>
      <header className="card-head">
        <span>
          GW{v.event} · {date}
        </span>
        <Verdict v={v} data={data} />
      </header>
      <div className="trade-sides">
        <Side side={v.offerer} v={v} data={data} myTeam={myTeam} />
        <Side side={v.receiver} v={v} data={data} myTeam={myTeam} />
      </div>
    </article>
  );
}

function Verdict({ v, data }: { v: TradeVerdict; data: LeagueData }) {
  if (v.pending) return <span className="verdict">Too early to call</span>;
  if (v.winner === null) return <span className="verdict">Level so far</span>;
  return (
    <span className="verdict win">
      {data.labels.get(v.winner)} +{v.margin}
    </span>
  );
}

function Side({ side, v, data, myTeam }: { side: TradeSide; v: TradeVerdict; data: LeagueData; myTeam: number | null }) {
  const won = !v.pending && v.winner === side.entryId;
  return (
    <div className={won ? "side won" : "side"}>
      <div className="side-head">
        <Manager id={side.entryId} data={data} mine={myTeam} /> got
      </div>
      <ul className="plain">
        {side.received.map((p) => (
          <li key={p.element}>
            <PlayerName id={p.element} data={data} />
            {!v.pending && (
              <span className="pts">
                {Math.round(p.value)} <span className="raw">({p.raw})</span>
              </span>
            )}
            {!v.pending && <Trail p={p} data={data} />}
          </li>
        ))}
      </ul>
      {!v.pending && (
        <div className="side-total">
          {Math.round(side.total)} pts <span className="raw">· on paper {side.raw}</span>
        </div>
      )}
    </div>
  );
}

/** Where the player went next, if he didn't stay. */
function Trail({ p, data }: { p: TradedPlayer; data: LeagueData }) {
  if (p.onward) {
    const o = p.onward;
    const names = o.received.map((id) => data.players.get(id)?.name ?? "someone").join(", ");
    const tooEarly = o.event > data.seasons.lastEvent;
    const worth = tooEarly
      ? "too early to say"
      : o.sentWith.length > 1
        ? `1/${o.sentWith.length} share = ${Math.round(o.value)}`
        : `${Math.round(o.value)}`;
    return (
      <div className="note">
        {p.points !== 0 && `${p.points} for them, then `}
        <button
          className="inline-link"
          onClick={() => document.getElementById(`trade-${o.tradeId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
        >
          ↳ traded on in GW{o.event} for {names}
        </button>{" "}
        · {worth}
      </div>
    );
  }
  if (p.droppedEvent !== null) return <div className="note">↳ dropped in GW{p.droppedEvent}</div>;
  if (!p.stillOwned && p.gameweeks > 0) return <div className="note">↳ gone after {p.gameweeks} GW</div>;
  return null;
}
