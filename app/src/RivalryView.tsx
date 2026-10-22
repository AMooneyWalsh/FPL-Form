import { useEffect, useMemo, useState } from "react";
import { rivalry, rivalryContext, type Rivalry, type TapeKey, type TapeRow } from "../../shared/rivalry";
import { hashParams, Manager, ManagerSelect, PlayerName, replaceHashParams, ScrollTable } from "./bits";
import type { LeagueData } from "./data";
import { ordinal } from "./format";
import { TradeCard } from "./TradesPage";
import { Battle } from "./WaiversPage";

/** The link for two managers' rivalry page. */
export function rivalryLink(a: number, b: number): string {
  return `#/league/h2h?a=${a}&b=${b}`;
}

/** Still on this view? Read the way App's routeFromHash reads it. */
function onThisView(): boolean {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0] === "league/h2h";
}

/**
 * League > Head to head (#/league/h2h?a=1412&b=72619): everything between two
 * managers. The pair lives in the link so it can be shared.
 */
export function RivalryView({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const ids = [...data.entries.keys()];
  const [pick, setPick] = useState(() => pairFromLink(data));
  // A link to another pair opened while already here (the page doesn't remount).
  useEffect(() => {
    const onChange = () => {
      if (onThisView()) setPick(pairFromLink(data));
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, [data]);
  const first = pick.a ?? myTeam ?? ids[0];
  const second = pick.b !== null && pick.b !== first ? pick.b : (defaultOpponent(data, first) ?? ids.find((id) => id !== first)!);
  // Keep the pair in the link, so copying the address shares this page.
  useEffect(() => {
    if (onThisView()) replaceHashParams({ a: first, b: second });
  }, [first, second]);

  const ctx = useMemo(
    () =>
      rivalryContext({
        details: data.league,
        seasons: data.seasons,
        trades: data.trades,
        transactions: data.transactions,
        draft: data.draft,
      }),
    [data],
  );
  const r = useMemo(() => rivalry(ctx, first, second), [ctx, first, second]);
  const A = data.labels.get(first) ?? "Someone";
  const B = data.labels.get(second) ?? "Someone";

  return (
    <>
      <section>
        <h2>Head to head</h2>
        <div className="h2h-pickers">
          <ManagerSelect data={data} value={first} onChange={(a) => setPick({ a, b: pick.b })} label="First manager" />
          <span className="muted">v</span>
          <ManagerSelect data={data} value={second} onChange={(b) => setPick({ a: first, b })} exclude={first} label="Second manager" />
        </div>
        <Meetings r={r} data={data} />
      </section>
      <Tape r={r} data={data} myTeam={myTeam} />

      <section>
        <h2>Trades between them</h2>
        {r.trades.length === 0 ? (
          <p className="notice">
            {A} and {B} haven't done a deal with each other yet.
          </p>
        ) : (
          <>
            <p className="hint">{tradeSummary(r, A, B)}</p>
            {r.trades.map((v) => (
              <TradeCard key={v.id} v={v} data={data} myTeam={myTeam} folded />
            ))}
          </>
        )}
      </section>

      <Battles r={r} data={data} myTeam={myTeam} A={A} B={B} />
      <Shared r={r} data={data} myTeam={myTeam} A={A} B={B} />
    </>
  );
}

/** The pair in the link, if both are managers in this league. */
function pairFromLink(data: LeagueData): { a: number | null; b: number | null } {
  const params = hashParams();
  const id = (key: string) => {
    const n = Number(params.get(key));
    return data.entries.has(n) ? n : null;
  };
  return { a: id("a"), b: id("b") };
}

/** Their next opponent, or the last one if the season's over. */
function defaultOpponent(data: LeagueData, me: number): number | undefined {
  const toEntry = new Map(data.league.league_entries.map((e) => [e.id, e.entry_id]));
  const mine = data.league.matches
    .filter((m) => toEntry.get(m.league_entry_1) === me || toEntry.get(m.league_entry_2) === me)
    .sort((x, y) => x.event - y.event);
  const m = mine.find((x) => !x.finished) ?? mine.at(-1);
  if (!m) return undefined;
  return toEntry.get(m.league_entry_1) === me ? toEntry.get(m.league_entry_2) : toEntry.get(m.league_entry_1);
}

// ---------------------------------------------------------------- meetings

/** Their real record, every meeting, and how it'd look if they'd played every week. */
function Meetings({ r, data }: { r: Rivalry; data: LeagueData }) {
  const h = r.meetings;
  const A = data.labels.get(r.a);
  const B = data.labels.get(r.b);
  // The league feed shows this week's matches as 0-0 until the gameweek ends, so point to Live instead.
  const playingNow = r.next !== null && data.inProgress && r.next === data.game.current_event;
  const w = r.everyWeek;
  const weeks = w.aAhead + w.bAhead + w.level;
  return (
    <>
      <div className="card h2h-card">
        <div className="h2h-score">
          <span>{h.aWins}</span>
          <span className="muted">–</span>
          <span>{h.bWins}</span>
        </div>
        <div className="hint">
          {h.matches.length === 0
            ? playingNow
              ? "No results between them yet."
              : "They haven't played each other yet."
            : `${h.matches.length} ${h.matches.length === 1 ? "meeting" : "meetings"}${h.draws ? `, ${h.draws} drawn` : ""} · points ${h.aPoints}–${h.bPoints}`}
          {playingNow ? (
            <>
              {` They're playing each other now, in GW${r.next}. `}
              <a className="link" href="#/live/matches">
                Live score
              </a>
            </>
          ) : (
            r.next !== null && ` · next in GW${r.next}`
          )}
        </div>
      </div>
      {h.matches.length > 0 && (
        <ScrollTable>
          <table className="data">
            <thead>
              <tr>
                <th className="left">GW</th>
                <th className="num">{A}</th>
                <th className="num">{B}</th>
                <th className="left">Winner</th>
              </tr>
            </thead>
            <tbody>
              {h.matches.map((m) => (
                <tr key={m.event}>
                  <td className="left">GW{m.event}</td>
                  <td className="num strong">{m.score}</td>
                  <td className="num strong">{m.against}</td>
                  <td className="left">{m.result === "D" ? "Draw" : m.result === "W" ? A : B}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
      {weeks > 0 && (
        <div className="card rival-every">
          <h3 className="card-title">If they'd played every week</h3>
          <div className="rival-every-score">
            <span className="rival-every-name">{A}</span>
            <span className="rival-every-num">
              {w.aAhead} – {w.bAhead}
            </span>
            <span className="rival-every-name">{B}</span>
          </div>
          <p className="hint">
            {w.aAhead === w.bAhead
              ? `Nothing in it: each outscored the other in ${w.aAhead} of ${weeks} gameweeks.`
              : `${w.aAhead > w.bAhead ? A : B} outscored ${w.aAhead > w.bAhead ? B : A} in ${Math.max(w.aAhead, w.bAhead)} of ${weeks} gameweeks.`}
            {w.level > 0 && ` Level in ${w.level}.`}
          </p>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- tale of the tape

const TAPE: Record<TapeKey, { label: string; show: (n: number) => string }> = {
  position: { label: "Position", show: ordinal },
  leaguePoints: { label: "League points", show: String },
  scored: { label: "Points scored", show: String },
  average: { label: "Average score", show: (n) => n.toFixed(1) },
  highest: { label: "Highest score", show: String },
  luck: { label: "Luck", show: signed },
  tradeNet: { label: "Trade net", show: signed },
  pickups: { label: "Pick-up points", show: String },
  draftGrade: { label: "Draft grade", show: ordinal },
};

function Tape({ r, data, myTeam }: { r: Rivalry; data: LeagueData; myTeam: number | null }) {
  const aLines = r.tape.filter((t) => t.leader === r.a).length;
  const bLines = r.tape.filter((t) => t.leader === r.b).length;
  const A = data.labels.get(r.a);
  const B = data.labels.get(r.b);
  const head = (id: number) => <span className={id === myTeam ? "mine-name" : undefined}>{data.labels.get(id)}</span>;
  const cell = (t: TapeRow, id: number, value: number) => (
    <td className={t.leader === id ? "num tape-best" : "num"}>{TAPE[t.key].show(value)}</td>
  );
  return (
    <section>
      <h2>Tale of the tape</h2>
      <p className="hint">
        {aLines === bLines
          ? `Dead level: ${aLines} lines each.`
          : `${aLines > bLines ? A : B} ${Math.abs(aLines - bLines) >= 4 ? "walks it" : "shades it"}, ahead on ${Math.max(aLines, bLines)} of the ${r.tape.length} lines.`}
      </p>
      <ScrollTable>
        <table className="data tape">
          <thead>
            <tr>
              <th className="left">
                <span className="sr-only">Stat</span>
              </th>
              <th className="num">{head(r.a)}</th>
              <th className="num">{head(r.b)}</th>
            </tr>
          </thead>
          <tbody>
            {r.tape.map((t) => (
              <tr key={t.key}>
                <td className="left">{TAPE[t.key].label}</td>
                {cell(t, r.a, t.a)}
                {cell(t, r.b, t.b)}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </section>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

// ---------------------------------------------------------------- trades, waivers, shared players

function tradeSummary(r: Rivalry, A: string, B: string): string {
  const t = r.tradeTally;
  const count = `${r.trades.length} ${r.trades.length === 1 ? "trade" : "trades"}`;
  const decided = t.aWon + t.bWon + t.level;
  if (decided === 0) return `${count}, too early to call.`;
  const ahead = t.net === 0 ? "All square across them" : `${t.net > 0 ? A : B} is ${Math.abs(t.net)} points up across them`;
  const record = `${A} won ${t.aWon}, ${B} won ${t.bWon}${t.level ? `, ${t.level} level` : ""}${t.pending ? `, ${t.pending} too early to call` : ""}`;
  return `${count}. ${ahead} (${record}).`;
}

const BATTLES_SHOWN = 5;

function Battles({ r, data, myTeam, A, B }: { r: Rivalry; data: LeagueData; myTeam: number | null; A: string; B: string }) {
  const [all, setAll] = useState(false);
  const t = r.battleTally;
  // Someone else got him, or every claim was void.
  const others = t.other === 0 ? "" : `, and the other ${t.other} got away`;
  return (
    <section>
      <h2>Waiver battles</h2>
      {r.battles.length === 0 ? (
        <p className="notice">
          {A} and {B} haven't gone for the same player yet.
        </p>
      ) : (
        <>
          <p className="hint">
            Players both claimed. {A} got {t.aWon}, {B} got {t.bWon}
            {others}.
          </p>
          {(all ? r.battles : r.battles.slice(0, BATTLES_SHOWN)).map((b) => (
            <Battle key={`${b.event}-${b.element}`} b={b} data={data} myTeam={myTeam} withEvent />
          ))}
          {r.battles.length > BATTLES_SHOWN && (
            <button className="link" onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${r.battles.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Shared({ r, data, myTeam, A, B }: { r: Rivalry; data: LeagueData; myTeam: number | null; A: string; B: string }) {
  const head = (id: number, name: string) => <span className={id === myTeam ? "mine-name" : undefined}>{name}</span>;
  return (
    <section>
      <h2>Played for both</h2>
      {r.shared.length === 0 ? (
        <p className="notice">
          Nobody has turned out for both {A} and {B} yet.
        </p>
      ) : (
        <>
          <p className="hint">Points each one got out of him in their starting XI.</p>
          <ScrollTable>
            <table className="data">
              <thead>
                <tr>
                  <th className="left">Player</th>
                  <th className="num">{head(r.a, A)}</th>
                  <th className="num">{head(r.b, B)}</th>
                  <th className="left">First with</th>
                </tr>
              </thead>
              <tbody>
                {r.shared.map((p) => (
                  <tr key={p.element}>
                    <td className="left">
                      <PlayerName id={p.element} data={data} />
                    </td>
                    <td className={p.aPoints > p.bPoints ? "num strong" : "num"}>{p.aPoints}</td>
                    <td className={p.bPoints > p.aPoints ? "num strong" : "num"}>{p.bPoints}</td>
                    <td className="left">
                      <Manager id={p.first} data={data} mine={myTeam} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </>
      )}
    </section>
  );
}
