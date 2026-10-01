import { useState } from "react";
import type { LedgerRow } from "../../shared/moves";
import { Manager, Pts } from "./bits";
import type { LeagueData } from "./data";

const SIZE = 360;
const MID = SIZE / 2;
const RING = 122;

/**
 * Who trades with whom. Managers sit round a circle: dot size is how many
 * trades they've made, colour is their trade net (green up, red down), and a
 * line's thickness is how often that pair has traded. Tap a dot to focus it.
 */
export function TradeNetwork({ ledger, data, myTeam }: { ledger: LedgerRow[]; data: LeagueData; myTeam: number | null }) {
  const [focus, setFocus] = useState<number | null>(null);
  // Busiest traders first, so they spread round the top of the circle.
  const rows = [...ledger].sort((a, b) => b.trades - a.trades || (data.labels.get(a.entryId) ?? "").localeCompare(data.labels.get(b.entryId) ?? ""));
  const pos = new Map(
    rows.map((r, i) => {
      const angle = (i / rows.length) * 2 * Math.PI - Math.PI / 2;
      return [r.entryId, { x: MID + RING * Math.cos(angle), y: MID + RING * Math.sin(angle), angle }];
    }),
  );
  const pairs: { a: number; b: number; n: number }[] = [];
  for (const r of rows) for (const [other, n] of r.partners) if (r.entryId < other) pairs.push({ a: r.entryId, b: other, n });
  pairs.sort((x, y) => y.n - x.n);
  if (pairs.length === 0) return null;

  const touches = (p: { a: number; b: number }) => focus === null || p.a === focus || p.b === focus;
  const linked = (id: number) =>
    focus === null || id === focus || pairs.some((p) => touches(p) && (p.a === id || p.b === id));
  const focused = focus !== null ? rows.find((r) => r.entryId === focus) : undefined;

  return (
    <section>
      <h2>Trade network</h2>
      <p className="hint">
        Dot size is how many trades someone has made, green or red is whether they're up or down on them, and thicker
        lines mean a pair trade more. Tap a manager to see just their trades.
      </p>
      <div className="card net-card">
        <svg viewBox={`-40 0 ${SIZE + 80} ${SIZE}`} className="net" role="img" aria-label="Trade network">
          <rect x={-40} width={SIZE + 80} height={SIZE} fill="transparent" onClick={() => setFocus(null)} />
          {pairs.map((p) => {
            const a = pos.get(p.a)!;
            const b = pos.get(p.b)!;
            return (
              <line
                key={`${p.a}-${p.b}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={touches(p) ? "net-edge" : "net-edge dim"}
                strokeWidth={1.5 + p.n * 1.8}
              />
            );
          })}
          {rows.map((r) => {
            const { x, y, angle } = pos.get(r.entryId)!;
            const radius = r.trades === 0 ? 4 : 6 + 3 * Math.sqrt(r.trades);
            const tone = r.trades === 0 ? "none" : r.net > 0 ? "up" : r.net < 0 ? "down" : "level";
            const lx = MID + (RING + radius + 10) * Math.cos(angle);
            const ly = MID + (RING + radius + 10) * Math.sin(angle);
            const anchor = Math.abs(Math.cos(angle)) < 0.3 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
            return (
              <g
                key={r.entryId}
                className={`net-node ${tone} ${linked(r.entryId) ? "" : "dim"} ${r.entryId === focus ? "on" : ""} ${r.entryId === myTeam ? "me" : ""}`}
                onClick={() => setFocus(focus === r.entryId ? null : r.entryId)}
                role="button"
                aria-label={`${data.labels.get(r.entryId)}: ${r.trades} trades`}
              >
                <circle cx={x} cy={y} r={radius + 10} fill="transparent" />
                <circle cx={x} cy={y} r={radius} className="dot" />
                <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle">
                  {data.labels.get(r.entryId)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {focused ? (
        <div className="card net-detail">
          <div className="battle-head">
            <Manager id={focused.entryId} data={data} mine={myTeam} />
            <span className="battle-pts">
              {focused.trades} {focused.trades === 1 ? "trade" : "trades"} · net <Pts n={focused.net} signed />
            </span>
          </div>
          {focused.partners.size === 0 ? (
            <p className="hint">No trades yet.</p>
          ) : (
            <ul className="plain facts">
              {[...focused.partners]
                .sort((a, b) => b[1] - a[1])
                .map(([other, n]) => (
                  <li key={other}>
                    With <Manager id={other} data={data} mine={myTeam} /> <span className="player-meta">× {n}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="card net-detail">
          <h3 className="card-title">Top trade partnerships</h3>
          <ul className="plain facts">
            {pairs.slice(0, 5).map((p) => (
              <li key={`${p.a}-${p.b}`}>
                <Manager id={p.a} data={data} mine={myTeam} /> ↔ <Manager id={p.b} data={data} mine={myTeam} />{" "}
                <span className="player-meta">× {p.n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
