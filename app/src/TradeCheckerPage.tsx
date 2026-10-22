import { useEffect, useMemo, useState } from "react";
import {
  allRatings,
  POSITIONS,
  positionCounts,
  squadsByEntry,
  tradeEffect,
  type Position,
  type XIChange,
} from "../../shared/trading";
import type { Player } from "../../shared/types";
import { clubDifficulty, fixtureRun } from "../../shared/waivers";
import { Explainer, FixtureChips, hashParams, InjuryFlag, PlayerName, replaceHashParams } from "./bits";
import type { LeagueData } from "./data";

/** Singular and plural, for sentences like "2 defenders and 1 midfielder". */
export const POSITION_WORDS: Record<Position, [string, string]> = {
  GKP: ["keeper", "keepers"],
  DEF: ["defender", "defenders"],
  MID: ["midfielder", "midfielders"],
  FWD: ["forward", "forwards"],
};

/** Ratings, squads and club names for the trade tools, worked out once per refresh. */
export function useTradeData(data: LeagueData) {
  return useMemo(
    () => ({
      ratings: allRatings(data.playerList, data.fixtures, data.seasons.lastEvent),
      squads: squadsByEntry(data.playerList, data.owners),
      clubs: new Map(data.playerList.map((p) => [p.teamId, p.team])),
    }),
    [data],
  );
}

/** How to talk about a manager: "you" for the viewer, their name for anyone else. */
export interface Who {
  you: boolean;
  name: string;
  /** "you're" or "Ben is" */
  is: string;
  /** "your" or "Ben's" */
  their: string;
  /** "yours" or "Ben's" */
  whose: string;
}

export function whoIs(data: LeagueData, id: number, myTeam: number | null): Who {
  if (id === myTeam) return { you: true, name: "you", is: "you're", their: "your", whose: "yours" };
  const name = data.labels.get(id) ?? "Someone";
  return { you: false, name, is: `${name} is`, their: `${name}'s`, whose: `${name}'s` };
}

export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** "+1.4", "-0.6" or "0.0", green or red. */
export function Change({ n }: { n: number }) {
  return <span className={n > 0 ? "pts-pos" : n < 0 ? "pts-neg" : undefined}>{`${n > 0 ? "+" : ""}${n.toFixed(1)}`}</span>;
}

/** The checker with a trade filled in, for "Open in the trade checker" links. */
export function checkerLink(from: number, other: number, give: number[], get: number[]): string {
  const params = new URLSearchParams({ from: String(from), with: String(other), give: give.join(","), get: get.join(",") });
  return `#/moves/checker?${params}`;
}

export function ManagerSelect({
  data,
  value,
  onChange,
  exclude,
  label,
  placeholder,
}: {
  data: LeagueData;
  value: number | null;
  onChange: (id: number | null) => void;
  exclude?: number | null;
  label: string;
  placeholder: string;
}) {
  const options = [...data.entries.keys()]
    .filter((id) => id !== exclude)
    .sort((x, y) => (data.labels.get(x) ?? "").localeCompare(data.labels.get(y) ?? ""));
  return (
    <select
      className="select"
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">{placeholder}</option>
      {options.map((id) => (
        <option key={id} value={id}>
          {data.labels.get(id)}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------- the checker

/** A trade being checked: `from` sends `give` to `other`, who sends back `get`. */
interface Deal {
  from: number | null;
  other: number | null;
  give: number[];
  get: number[];
}

const PAGE = "#/moves/checker";

/**
 * The trade in the link (#/moves/checker?from=&with=&give=&get=). Sent to the
 * manager on the other side, it's turned round so they see it as theirs.
 */
function dealFromLink(data: LeagueData, myTeam: number | null): Deal {
  const params = hashParams();
  const entry = (key: string) => {
    const id = Number(params.get(key));
    return data.entries.has(id) ? id : null;
  };
  const ids = (key: string) => (params.get(key) ?? "").split(",").map(Number).filter((n) => n > 0);
  const deal: Deal = { from: entry("from") ?? myTeam, other: entry("with"), give: ids("give"), get: ids("get") };
  if (myTeam !== null && deal.other === myTeam && deal.from !== myTeam) {
    return { from: myTeam, other: deal.from, give: deal.get, get: deal.give };
  }
  return deal.other === deal.from ? { ...deal, other: null, get: [] } : deal;
}

export function TradeCheckerPage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const { ratings, squads, clubs } = useTradeData(data);
  const [deal, setDeal] = useState(() => dealFromLink(data, myTeam));
  // Someone pasting another trade's link while already here.
  useEffect(() => {
    const onChange = () => window.location.hash.startsWith(PAGE) && setDeal(dealFromLink(data, myTeam));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, [data, myTeam]);

  const { from, other } = deal;
  // Only players each side still owns: a link can be older than the latest trade.
  const owned = (ids: number[], entry: number | null) =>
    ids.filter((id) => entry !== null && data.owners.get(id) === entry).map((id) => data.players.get(id)!);
  const give = owned(deal.give, from);
  const get = owned(deal.get, other);
  const giveIds = give.map((p) => p.id).join(",");
  const getIds = get.map((p) => p.id).join(",");
  useEffect(() => {
    if (window.location.hash.startsWith(PAGE)) replaceHashParams({ from, with: other, give: giveIds, get: getIds });
  }, [from, other, giveIds, getIds]);

  const toggle = (key: "give" | "get", id: number) =>
    setDeal((d) => ({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] }));
  const me = from === null ? null : whoIs(data, from, myTeam);
  const them = other === null ? null : whoIs(data, other, myTeam);

  return (
    <>
      <section>
        <h2>Trade checker</h2>
        <p className="hint">Pick who to trade with, tap players in both squads, and see what it does to both XIs.</p>
        <div className="tc-pickers">
          {(myTeam === null || from !== myTeam) && (
            <label className="tc-picker">
              <span className="picker-label">From</span>
              <ManagerSelect
                data={data}
                value={from}
                onChange={(id) => setDeal((d) => ({ from: id, other: d.other === id ? null : d.other, give: [], get: d.other === id ? [] : d.get }))}
                label="Trade from"
                placeholder="Pick a manager…"
              />
            </label>
          )}
          <label className="tc-picker">
            <span className="picker-label">Trade with</span>
            <ManagerSelect
              data={data}
              value={other}
              onChange={(id) => setDeal((d) => ({ ...d, other: id, get: [] }))}
              exclude={from}
              label="Trade with"
              placeholder="Pick a manager…"
            />
          </label>
        </div>
        <Explainer>
          <p>
            Each player's rating starts from 60% recent form plus 40% points a game this season. Early in the season a
            few games can flatter or hide a player, so it also mixes in what his pre-season draft rank says: a player
            ranked that high usually scores this much. The draft rank counts as much as four starts, so it fades as
            the season goes on, and counts for less when he isn't getting many minutes. Then it's nudged up for easy fixtures
            over the next three gameweeks and down for hard ones, and cut by any injury doubt. Anyone who's out rates
            0. It works out at roughly the points he'd score in a game.
          </p>
          <p>
            A best XI is the highest-rated team each squad can put out under FPL's formation rules (1 keeper, 3 to 5
            defenders, 2 to 5 midfielders, 1 to 3 forwards). The checker tries every formation and keeps the best, so
            an XI's rating is roughly what it would score in a week.
          </p>
          <p>
            What a trade is worth to each manager is how much their best XI goes up or down. So a trade can lose rating
            and still help: swapping someone who'd sit on your bench for someone who'd start is pure profit.
          </p>
          <p>
            FPL only allows like-for-like trades: the same number of keepers, defenders, midfielders and forwards each
            way. The link always carries the trade, so you can send it to the other manager.
          </p>
        </Explainer>
      </section>

      {me && from !== null && (
        <SquadPicker
          title={`${cap(me.their)} squad`}
          hint={me.you ? "Tap who you'd send." : `Tap who ${me.name} would send.`}
          squad={squads.get(from) ?? []}
          picked={give}
          onToggle={(id) => toggle("give", id)}
          ratings={ratings}
          data={data}
        />
      )}
      {them && other !== null && (
        <SquadPicker
          title={`${cap(them.their)} squad`}
          hint={me?.you ? "Tap who you'd want back." : "Tap who they'd send back."}
          squad={squads.get(other) ?? []}
          picked={get}
          onToggle={(id) => toggle("get", id)}
          ratings={ratings}
          data={data}
        />
      )}

      <Verdict
        data={data}
        me={me}
        them={them}
        mine={squads.get(from ?? -1) ?? []}
        theirs={squads.get(other ?? -1) ?? []}
        give={give}
        get={get}
        ratings={ratings}
      />

      {me && them && (give.length > 0 || get.length > 0) && (
        <section>
          <h2>The players</h2>
          <TradePlayers title={`${cap(me.name)} ${me.you ? "get" : "gets"}`} players={get} data={data} ratings={ratings} clubs={clubs} />
          <TradePlayers title={`${cap(them.name)} ${them.you ? "get" : "gets"}`} players={give} data={data} ratings={ratings} clubs={clubs} />
          {!data.officialDifficulty && (
            <p className="notice warn">
              FPL's difficulty ratings couldn't be loaded just now, so fixture colours are an estimate from each club's
              FPL points this season.
            </p>
          )}
        </section>
      )}
    </>
  );
}

/** One squad to pick from: each position on its own row, best rating first. */
function SquadPicker({
  title,
  hint,
  squad,
  picked,
  onToggle,
  ratings,
  data,
}: {
  title: string;
  hint: string;
  squad: Player[];
  picked: Player[];
  onToggle: (id: number) => void;
  ratings: Map<number, number>;
  data: LeagueData;
}) {
  const rating = (p: Player) => ratings.get(p.id) ?? 0;
  return (
    <section>
      <h2>{title}</h2>
      <p className="hint">{hint}</p>
      {squad.length === 0 && <p className="notice">No players found for this squad just now.</p>}
      {POSITIONS.map((pos) => {
        const here = squad.filter((p) => p.position === pos).sort((a, b) => rating(b) - rating(a) || b.totalPoints - a.totalPoints);
        if (here.length === 0) return null;
        return (
          <div key={pos} className="tc-pos">
            <div className="tc-pos-label">{POSITION_WORDS[pos][1]}</div>
            <div className="chips tc-chips" role="group" aria-label={`${title}: ${POSITION_WORDS[pos][1]}`}>
              {here.map((p) => {
                const on = picked.some((x) => x.id === p.id);
                return (
                  <button
                    key={p.id}
                    className={on ? "chip-btn active tc-chip" : "chip-btn tc-chip"}
                    aria-pressed={on}
                    onClick={() => onToggle(p.id)}
                    title={data.players.get(p.id)?.fullName}
                  >
                    {p.name}
                    <InjuryFlag p={p} />
                    <span className="tc-chip-rating">{rating(p).toFixed(1)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** "2 defenders and 1 midfielder", or "nobody". */
function positionList(players: Player[]): string {
  const counts = positionCounts(players);
  const parts = POSITIONS.filter((pos) => counts[pos] > 0).map(
    (pos) => `${counts[pos]} ${POSITION_WORDS[pos][counts[pos] === 1 ? 0 : 1]}`,
  );
  if (parts.length === 0) return "nobody";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const sumOf = (players: Player[], ratings: Map<number, number>) =>
  Math.round(players.reduce((s, p) => s + (ratings.get(p.id) ?? 0), 0) * 10) / 10;

/**
 * What the trade does to both best XIs. The top line sticks to the bottom of
 * the screen while picking players, so the answer is always in view.
 */
function Verdict({
  data,
  me,
  them,
  mine,
  theirs,
  give,
  get,
  ratings,
}: {
  data: LeagueData;
  me: Who | null;
  them: Who | null;
  mine: Player[];
  theirs: Player[];
  give: Player[];
  get: Player[];
  ratings: Map<number, number>;
}) {
  if (!me || !them) {
    return <div className="tc-bar">{me ? "Pick a manager to trade with." : "Pick both managers."}</div>;
  }
  if (give.length === 0 && get.length === 0) return <div className="tc-bar">Tap players in both squads to build a trade.</div>;
  if (give.length === 0) return <div className="tc-bar">Now tap who {me.you ? "you'd" : `${me.name} would`} send.</div>;
  if (get.length === 0) return <div className="tc-bar">Now tap who {me.you ? "you'd want" : `${me.name} would get`} back.</div>;

  const effect = tradeEffect(mine, theirs, give, get, ratings, data.rules);
  if (!effect.likeForLike) {
    const shape = POSITIONS.map((pos) => `${data.rules.select[pos]} ${POSITION_WORDS[pos][1]}`);
    return (
      <>
        <div className="tc-bar warn">The positions don't match, so FPL won't allow this one.</div>
        <p className="notice warn">
          Trades have to be like for like: the same number of keepers, defenders, midfielders and forwards each way, so
          both squads still have {shape.slice(0, -1).join(", ")} and {shape[shape.length - 1]}. Right now{" "}
          {me.you ? "you'd" : `${me.name} would`} send {positionList(give)} and get {positionList(get)}.
        </p>
      </>
    );
  }

  const out = sumOf(give, ratings);
  const into = sumOf(get, ratings);
  const { mine: a, theirs: b } = effect;
  const twist =
    out > into && a.change > 0
      ? `More rating goes out than comes in (${out.toFixed(1)} v ${into.toFixed(1)}), but ${me.their} XI still gets better: it's who starts that counts.`
      : into > out && a.change < 0
        ? `More rating comes in than goes out (${into.toFixed(1)} v ${out.toFixed(1)}), but ${me.their} XI still gets worse: it's who starts that counts.`
        : null;
  return (
    <>
      <div className="tc-bar">
        <div className="tc-bar-xis">
          <span>
            {cap(me.their)} XI <Change n={a.change} />
          </span>
          <span>
            {cap(them.their)} XI <Change n={b.change} />
          </span>
        </div>
        <div className="tc-bar-verdict">{verdict(me, them, a.change, b.change)}</div>
      </div>
      <section className="card tc-xis">
        <XILine who={me} change={a} data={data} />
        <XILine who={them} change={b} data={data} />
        {twist && <p className="hint tc-twist">{twist}</p>}
      </section>
    </>
  );
}

/** Plain-English verdict from each XI going up (1), down (-1) or nowhere (0). */
function verdict(a: Who, b: Who, mine: number, theirs: number): string {
  const way = (n: number) => (n >= 0.1 ? 1 : n <= -0.1 ? -1 : 0);
  const [x, y] = [way(mine), way(theirs)];
  if (x === 1 && y === 1) return "Everyone's a winner: both XIs get better.";
  if (x === -1 && y === -1) return "Both XIs get worse. Nobody wants this one.";
  if (x === 1 && y === -1) return a.you ? `Good for you, bad for ${b.name}. Good luck selling it.` : `Good for ${a.name}, bad for ${b.name}.`;
  if (x === -1 && y === 1) return a.you ? `Better for ${b.name} than you. Very generous.` : `Better for ${b.name} than ${a.name}.`;
  if (x === 1) return `${cap(a.their)} XI gets better and ${b.whose} doesn't notice.`;
  if (y === 1) return `${cap(b.their)} XI gets better and ${a.whose} stays the same.`;
  if (x === -1) return `${cap(a.their)} XI gets worse and ${b.whose} stays the same.`;
  if (y === -1) return `${cap(b.their)} XI gets worse and ${a.whose} stays the same.`;
  return "Neither XI changes. Just a bench shuffle.";
}

/** "Your best XI +1.4 · 45.0 now, 46.4 after · In: Semenyo · Out: Mbeumo" */
function XILine({ who, change, data }: { who: Who; change: XIChange; data: LeagueData }) {
  const names = (ids: number[]) =>
    ids.map((id, i) => (
      <span key={id}>
        {i > 0 && ", "}
        <PlayerName id={id} data={data} detail={false} />
      </span>
    ));
  return (
    <div className="tc-xi">
      <div className="tc-xi-head">
        <strong>{cap(who.their)} best XI</strong>
        <span className="strong">
          <Change n={change.change} />
        </span>
      </div>
      <div className="hint">
        {change.before.total.toFixed(1)} now, {change.after.total.toFixed(1)} after
        {change.joins.length > 0 && <> · In: {names(change.joins)}</>}
        {change.leaves.length > 0 && <> · Out: {names(change.leaves)}</>}
      </div>
    </div>
  );
}

/** One side's incoming players, each with the numbers behind his rating. */
function TradePlayers({
  title,
  players,
  data,
  ratings,
  clubs,
}: {
  title: string;
  players: Player[];
  data: LeagueData;
  ratings: Map<number, number>;
  clubs: Map<number, string>;
}) {
  const difficulty = useMemo(() => clubDifficulty(data.playerList), [data]);
  if (players.length === 0) return null;
  return (
    <>
      <h3>
        {title} · {sumOf(players, ratings).toFixed(1)}
      </h3>
      {players.map((p) => (
        <article key={p.id} className="card sugg">
          <div className="sugg-head">
            <span>
              <PlayerName id={p.id} data={data} />
            </span>
            <span className="sugg-rating" title="Rating">
              {(ratings.get(p.id) ?? 0).toFixed(1)}
            </span>
          </div>
          <div className="sugg-stats">
            Form {p.form.toFixed(1)} · {p.pointsPerGame.toFixed(1)} a game · {p.totalPoints} pts this season · draft rank{" "}
            {p.draftRank}
          </div>
          {p.news && <div className="sugg-stats">{p.news}</div>}
          <FixtureChips run={fixtureRun(p.teamId, data.fixtures, difficulty)} clubs={clubs} />
        </article>
      ))}
    </>
  );
}
