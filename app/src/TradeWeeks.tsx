import { useState, type PointerEvent } from "react";
import { timelineStory, tradeTimeline, type TimelinePoint, type TradeVerdict } from "../../shared/moves";
import { Manager } from "./bits";
import type { LeagueData } from "./data";

// Every trade's week-by-week verdict, worked out once per load of the league
// data and shared by every card that opens (Trades page, manager pages).
const timelines = new WeakMap<LeagueData, Map<number, TimelinePoint[]>>();

export function tradeTimelines(data: LeagueData): Map<number, TimelinePoint[]> {
  let t = timelines.get(data);
  if (!t) {
    t = tradeTimeline(data.trades, data.seasons, data.transactions);
    timelines.set(data, t);
  }
  return t;
}

/** One plain sentence on how a trade has gone: "Ben ahead every week", "Daire came from 12 behind". */
export function storyLine(points: TimelinePoint[], name: (id: number) => string): string {
  const story = timelineStory(points);
  const now = points.at(-1)?.winner ?? null;
  if (story.everyWeek !== null) return `${name(story.everyWeek)} ahead every week.`;
  if (story.changes >= 2) return `Lead changed hands ${story.changes === 2 ? "twice" : `${story.changes} times`}.`;
  if (story.comeback) return `${name(story.comeback.entryId)} came from ${story.comeback.from} behind.`;
  if (now !== null) return `${name(now)} never behind.`;
  const led = [...new Set(points.map((p) => p.winner).filter((id): id is number => id !== null))];
  if (led.length === 0) return "Level every week.";
  return `Level now, after ${led.map(name).join(" and ")} led.`;
}

// Chart units. Names on the left, a bar per gameweek: up when the first
// manager was ahead, down when the second was.
const W = 320;
const LEFT = 66;
const ZERO = 54;
const HALF = 36;
const H = 118;

/**
 * Inside an opened trade card: who was ahead after each gameweek since the
 * trade, and by how much. Only once two gameweeks have been played. Tap or
 * drag along it to see any week's totals.
 */
export function TradeWeeks({ v, data, myTeam }: { v: TradeVerdict; data: LeagueData; myTeam: number | null }) {
  const points = tradeTimelines(data).get(v.id) ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  if (v.pending || points.length < 2) return null;

  const up = v.offerer.entryId;
  const down = v.receiver.entryId;
  const name = (id: number) => data.labels.get(id) ?? "Someone";
  // Series 1 is always the viewer; anyone else's trade stays grey.
  const tone = (id: number) => (myTeam === up || myTeam === down ? (id === myTeam ? "s1" : "s2") : "");
  const slot = Math.min((W - LEFT - 4) / points.length, 28);
  const bar = Math.max(2, Math.min(slot - 2, 20));
  const most = Math.max(...points.map((p) => p.margin), 1);
  const x = (i: number) => LEFT + i * slot + slot / 2;
  const height = (p: TimelinePoint) => Math.max(2, (p.margin / most) * HALF);
  const shown = picked ?? points.length - 1;
  const at = points[shown];

  // Label the latest bar, and each side's best week if it's not right next to it.
  const peak = (id: number) => {
    let best = -1;
    points.forEach((p, i) => p.winner === id && (best === -1 || p.margin > points[best].margin) && (best = i));
    return best;
  };
  const labelled = new Set([points.length - 1, ...[peak(up), peak(down)].filter((i) => i >= 0 && points.length - 1 - i >= 2)]);
  const gwLabels = new Set([0, points.length - 1, ...(points.length >= 6 ? [Math.floor((points.length - 1) / 2)] : [])]);

  const pickFrom = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const chartX = ((e.clientX - box.left) / box.width) * W;
    const i = Math.floor((chartX - LEFT) / slot);
    if (i >= 0 && i < points.length) setPicked(i);
  };
  const story = storyLine(points, name);
  const round = (n: number) => Math.round(n);

  return (
    <div className="trade-weeks">
      <h3>Week by week</h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="tw-chart"
        role="img"
        aria-label={`Who was ahead after each gameweek. ${story}`}
        onPointerDown={pickFrom}
        onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons > 0) && pickFrom(e)}
      >
        <text x={0} y={ZERO - HALF / 2} className="tw-name">
          {short(name(up))}
        </text>
        <text x={0} y={ZERO - HALF / 2 + 12} className="tw-ahead">
          ahead
        </text>
        <text x={0} y={ZERO + HALF / 2 + 2} className="tw-name">
          {short(name(down))}
        </text>
        <text x={0} y={ZERO + HALF / 2 + 14} className="tw-ahead">
          ahead
        </text>
        <line x1={LEFT} x2={W} y1={ZERO} y2={ZERO} className="tw-zero" />
        {points.map((p, i) => {
          const cls = `tw-bar ${p.winner === null ? "level" : tone(p.winner)}${i === shown ? "" : " faded"}`;
          if (p.winner === null) return <rect key={p.event} x={x(i) - bar / 2} y={ZERO - 1} width={bar} height={2} className={cls} />;
          const h = height(p);
          const top = p.winner === up;
          return (
            <g key={p.event}>
              <rect x={x(i) - bar / 2} y={top ? ZERO - h : ZERO} width={bar} height={h} rx={Math.min(2, bar / 2)} className={cls} />
              {labelled.has(i) && (
                <text x={x(i)} y={top ? ZERO - h - 4 : ZERO + h + 11} textAnchor="middle" className="tw-value">
                  {p.margin}
                </text>
              )}
            </g>
          );
        })}
        {points.map(
          (p, i) =>
            gwLabels.has(i) && (
              <text key={p.event} x={x(i)} y={H - 2} textAnchor="middle" className="axis">
                GW{p.event}
              </text>
            ),
        )}
      </svg>
      <p className="tw-story">{story}</p>
      <p className="hint tw-detail">
        After GW{at.event},{" "}
        {at.winner === null ? (
          `level at ${round(at.offerer)} each`
        ) : (
          <>
            <Manager id={at.winner} data={data} mine={myTeam} /> led{" "}
            {round(Math.max(at.offerer, at.receiver))} to {round(Math.min(at.offerer, at.receiver))}
          </>
        )}
        .
      </p>
    </div>
  );
}

/** Long names would run into the bars. */
function short(name: string): string {
  return name.length > 9 ? `${name.slice(0, 8)}…` : name;
}

export interface Turnaround {
  v: TradeVerdict;
  from: number;
}

/** Trades where whoever's ahead now was once well behind, biggest comeback first. */
export function biggestTurnarounds(verdicts: TradeVerdict[], data: LeagueData, atLeast = 3, top = 3): Turnaround[] {
  const t = tradeTimelines(data);
  return verdicts
    .flatMap((v) => {
      const comeback = timelineStory(t.get(v.id) ?? []).comeback;
      return comeback && comeback.from >= atLeast ? [{ v, from: comeback.from }] : [];
    })
    .sort((a, b) => b.from - a.from || b.v.margin - a.v.margin)
    .slice(0, top);
}

/** "Biggest turnarounds" on the Trades page. Tapping one opens its card. */
export function Turnarounds({
  rows,
  data,
  myTeam,
  onOpen,
}: {
  rows: Turnaround[];
  data: LeagueData;
  myTeam: number | null;
  onOpen: (tradeId: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2>Biggest turnarounds</h2>
      <p className="hint">Trades where the manager ahead now was once behind.</p>
      <ul className="plain card turnarounds">
        {rows.map(({ v, from }) => {
          const loser = v.winner === v.offerer.entryId ? v.receiver.entryId : v.offerer.entryId;
          const mine = v.offerer.entryId === myTeam || v.receiver.entryId === myTeam;
          return (
            <li key={v.id} className={mine ? "is-mine" : undefined}>
              <span>
                <Manager id={v.winner!} data={data} mine={myTeam} /> came from {from} behind against{" "}
                <Manager id={loser} data={data} mine={myTeam} />, now +{v.margin}.
              </span>
              <button type="button" className="chip-btn" onClick={() => onOpen(v.id)}>
                GW{v.event} trade
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
