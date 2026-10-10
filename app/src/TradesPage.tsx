import { useEffect, useMemo, useState } from "react";
import { tradeLedger, tradeVerdicts, type TradedPlayer, type TradeSide, type TradeVerdict } from "../../shared/moves";
import { Explainer, Manager, nobody, PlayerName, Pts, SectionHead, ShowFilter, useShownManager } from "./bits";
import type { LeagueData } from "./data";
import { TradeNetwork } from "./TradeNetwork";

export function TradesPage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const [who, setWho] = useShownManager();
  const verdicts = useMemo(() => tradeVerdicts(data.trades, data.seasons, data.transactions), [data]);
  const ledger = useMemo(() => tradeLedger(verdicts, [...data.entries.keys()]), [verdicts, data]);
  const shown =
    who === null ? verdicts : verdicts.filter((v) => v.offerer.entryId === who || v.receiver.entryId === who);

  return (
    <>
      <section>
        <h2>Who's winning at trading</h2>
        <p className="hint">Points from the players they got, minus points from the players they gave away.</p>
        <Explainer>
          <p>
            The players they got count what they've scored in that manager's starting XI. The players they gave away
            count what they've scored in their new owner's starting XI. Bench points don't count, and a player they'd
            got in a trade themselves isn't counted again when they pass him on.
          </p>
        </Explainer>
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

      <TradeNetwork ledger={ledger} data={data} myTeam={myTeam} />

      <section>
        <SectionHead title="Every trade">
          <ShowFilter data={data} value={who} onChange={setWho} myTeam={myTeam} />
        </SectionHead>
        <p className="hint">Newest first. Tap a trade to see each player's points.</p>
        <Explainer>
          <p>
            Each player's number is what he was worth to the manager who got him: his points in their starting XI, plus,
            if they traded him on, a share of what they got for him.
          </p>
          <p>"In all" is everything he's scored since the trade, for whoever had him, bench included.</p>
        </Explainer>
        {shown.length === 0 && (
          <p className="notice">{who === null ? "No trades yet this season." : nobody(data, who, myTeam, "made any trades")}</p>
        )}
        {shown.map((v) => (
          <TradeCard key={v.id} v={v} data={data} myTeam={myTeam} folded />
        ))}
      </section>
    </>
  );
}

/** Asks the trade card with this id to open, e.g. when a "traded on" link points at it. */
const OPEN_TRADE = "open-trade";

/**
 * One trade. `folded` starts it as a short summary (who got whom, and the
 * verdict) that opens on tap, for long lists.
 */
export function TradeCard({
  v,
  data,
  myTeam,
  folded = false,
}: {
  v: TradeVerdict;
  data: LeagueData;
  myTeam: number | null;
  folded?: boolean;
}) {
  const [open, setOpen] = useState(!folded);
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<number>).detail === v.id) setOpen(true);
    };
    window.addEventListener(OPEN_TRADE, onOpen);
    return () => window.removeEventListener(OPEN_TRADE, onOpen);
  }, [v.id]);
  const date = new Date(v.time).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const mine = v.offerer.entryId === myTeam || v.receiver.entryId === myTeam;
  const head = (
    <header className="card-head">
      <span>
        GW{v.event} · {date}
      </span>
      <Verdict v={v} data={data} />
    </header>
  );
  if (!open) {
    return (
      <article className={`card trade-card${mine ? " mine-card" : ""}`} id={`trade-${v.id}`}>
        <button className="fold-btn" onClick={() => setOpen(true)} aria-expanded={false}>
          {head}
          <SideLine side={v.offerer} v={v} data={data} />
          <SideLine side={v.receiver} v={v} data={data} />
        </button>
      </article>
    );
  }
  return (
    <article className={`card trade-card${mine ? " mine-card" : ""}`} id={`trade-${v.id}`}>
      {folded ? (
        <button className="fold-btn" onClick={() => setOpen(false)} aria-expanded={true}>
          {head}
        </button>
      ) : (
        head
      )}
      <div className="trade-sides">
        <Side side={v.offerer} v={v} data={data} myTeam={myTeam} />
        <Side side={v.receiver} v={v} data={data} myTeam={myTeam} />
      </div>
      {data.reversals
        .filter((r) => r.tradeId === v.id)
        .map((r) => (
          <p key={r.undoneBy} className="hint undone">
            {r.players.map((id) => data.players.get(id)?.name ?? "someone").join(" and ")} were swapped back{" "}
            in the same gameweek (
            {new Date(r.undoneAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            ), so they're left out of this trade.
          </p>
        ))}
    </article>
  );
}

/** A folded trade's side in one line: "Daire got Suzuki, Richards, Enzo +3 · 2 pts". */
function SideLine({ side, v, data }: { side: TradeSide; v: TradeVerdict; data: LeagueData }) {
  const names = side.received.map((p) => data.players.get(p.element)?.name ?? "someone");
  const won = !v.pending && v.winner === side.entryId;
  return (
    <span className="trade-line">
      <span className="trade-line-who">
        <strong>{data.labels.get(side.entryId)}</strong> got {names.slice(0, 3).join(", ")}
        {names.length > 3 && ` +${names.length - 3}`}
      </span>
      {!v.pending && (
        <span className={won ? "trade-line-pts pts-pos" : "trade-line-pts"}>
          {Math.round(side.total)} {Math.round(side.total) === 1 ? "pt" : "pts"}
        </span>
      )}
    </span>
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
                {Math.round(p.value)}
                {p.raw !== Math.round(p.value) && <span className="raw"> ({p.raw} in all)</span>}
              </span>
            )}
            {!v.pending && <Trail p={p} data={data} />}
          </li>
        ))}
      </ul>
      {!v.pending && (
        <div className="side-total">
          {Math.round(side.total)} pts
          {side.raw !== Math.round(side.total) && <span className="raw"> · {side.raw} in all</span>}
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
          onClick={() => {
            window.dispatchEvent(new CustomEvent(OPEN_TRADE, { detail: o.tradeId }));
            document.getElementById(`trade-${o.tradeId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
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
