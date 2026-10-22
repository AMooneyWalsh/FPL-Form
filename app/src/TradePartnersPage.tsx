import { useMemo, useState } from "react";
import { leagueStrength, POSITIONS, tradePartners, type Partner, type Position, type SquadStrength } from "../../shared/trading";
import {
  Explainer,
  FoldSection,
  Manager,
  PlayerName,
  RowNo,
  ScrollTable,
  SectionHead,
  StatTile,
  Tag,
  type StatRank,
} from "./bits";
import type { LeagueData } from "./data";
import { cap, Change, checkerLink, ManagerSelect, useTradeData, whoIs, type Who } from "./TradeCheckerPage";

const AREA: Record<Position, string> = { GKP: "Keeper", DEF: "Defence", MID: "Midfield", FWD: "Attack" };
const AREA_IN: Record<Position, string> = { GKP: "in goal", DEF: "at the back", MID: "in midfield", FWD: "up front" };

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * "3rd best", "2nd worst", "Best in league": counted from the nearer end.
 * Top third green, bottom third red (the same rule as the manager page).
 */
function rankOf(values: number[], value: number): StatRank {
  const fromTop = 1 + values.filter((v) => v > value).length;
  const fromBottom = 1 + values.filter((v) => v < value).length;
  const tied = values.filter((v) => v === value).length > 1;
  const [word, n] = fromTop <= fromBottom ? ["best", fromTop] : ["worst", fromBottom];
  const text = n === 1 ? (tied ? `Joint ${word}` : `${cap(word)} in league`) : `${tied ? "Joint " : ""}${ordinal(n)} ${word}`;
  const third = Math.ceil(values.length / 3);
  return { text, tone: fromTop <= third ? "good" : fromBottom <= third ? "bad" : "meh" };
}

export function TradePartnersPage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const { ratings, squads } = useTradeData(data);
  const [who, setWho] = useState<number | null>(myTeam);
  const strength = useMemo(() => leagueStrength(squads, ratings, data.rules), [squads, ratings, data.rules]);
  const partners = useMemo(
    () => (who === null ? [] : tradePartners(who, squads, strength, ratings, data.rules)),
    [who, squads, strength, ratings, data.rules],
  );
  const me = strength.find((s) => s.entryId === who);
  const w = who === null ? null : whoIs(data, who, myTeam);

  return (
    <>
      <section>
        <SectionHead title={w ? `${cap(w.their)} squad by position` : "Squad by position"}>
          <ManagerSelect data={data} value={who} onChange={setWho} label="Whose squad" placeholder="Pick a manager…" />
        </SectionHead>
        {!me || !w ? (
          <p className="notice">Pick a manager to see how their squad compares.</p>
        ) : (
          <>
            <p className="hint">How each position compares with the rest of the league.</p>
            <div className="stat-row">
              {POSITIONS.map((pos) => (
                <StatTile
                  key={pos}
                  label={AREA[pos]}
                  value={me.positions[pos].rating.toFixed(1)}
                  rank={rankOf(strength.map((s) => s.positions[pos].rating), me.positions[pos].rating)}
                />
              ))}
            </div>
            <p className="hint">
              On the bench:{" "}
              {me.bench.map((id, i) => (
                <span key={id}>
                  {i > 0 && " · "}
                  <PlayerName id={id} data={data} detail={false} /> {(ratings.get(id) ?? 0).toFixed(1)}
                </span>
              ))}
            </p>
          </>
        )}
      </section>

      {me && w && (
        <section>
          <h2>Best trade partners</h2>
          <p className="hint">Strong where {w.you ? "you're" : `${w.name} is`} weak, weak where {w.you ? "you're" : `${w.name} is`} strong, with a swap to try.</p>
          <Explainer>
            <p>
              Strength in each position is the average rating of a squad's best keeper, 4 defenders, 4 midfielders and 2
              forwards (a typical XI), ranked against the other squads. Ratings are the same as the waiver suggestions and
              the trade checker: roughly the points a player would score in a game.
            </p>
            <p>
              For every other manager, every one-for-one and two-for-two swap that keeps both squads' shape is tried, and
              the one that does most for both best XIs is kept. If nothing helps both, it's the one that helps{" "}
              {w.their} XI and costs theirs least. Injured players are left out.
            </p>
            <p>Swaps that make both XIs better come first. Fair ones (where both gain a decent amount) rank highest.</p>
          </Explainer>
          {partners.length === 0 && (
            <p className="notice">No swap would make {w.their} XI any better right now. Not bad going.</p>
          )}
          {partners.map((p) => (
            <PartnerCard key={p.entryId} p={p} w={w} me={me} strength={strength} data={data} myTeam={myTeam} ratings={ratings} />
          ))}
        </section>
      )}

      <section>
        <FoldSection title="Every squad by position" count={`${strength.length} squads`}>
          <ScrollTable>
            <table className="data">
              <thead>
                <tr>
                  <th className="left">Manager</th>
                  <th className="num">XI</th>
                  {POSITIONS.map((pos) => (
                    <th key={pos} className="num">
                      {AREA[pos]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...strength]
                  .sort((a, b) => b.xi.total - a.xi.total)
                  .map((s, i) => (
                    <tr key={s.entryId} className={s.entryId === myTeam ? "mine" : undefined}>
                      <td className="left">
                        <RowNo>{i + 1}</RowNo>
                        <Manager id={s.entryId} data={data} mine={myTeam} />
                      </td>
                      <td className="num strong">{s.xi.total.toFixed(1)}</td>
                      {POSITIONS.map((pos) => {
                        const tone = rankOf(strength.map((x) => x.positions[pos].rating), s.positions[pos].rating).tone;
                        return (
                          <td key={pos} className={`num${tone === "meh" ? "" : ` tp-${tone}`}`}>
                            {s.positions[pos].rating.toFixed(1)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </ScrollTable>
        </FoldSection>
      </section>
    </>
  );
}

function PartnerCard({
  p,
  w,
  me,
  strength,
  data,
  myTeam,
  ratings,
}: {
  p: Partner;
  w: Who;
  me: SquadStrength;
  strength: SquadStrength[];
  data: LeagueData;
  myTeam: number | null;
  ratings: Map<number, number>;
}) {
  const them = strength.find((s) => s.entryId === p.entryId)!;
  const t = whoIs(data, p.entryId, myTeam);
  const both = p.swap.mine >= 0.1 && p.swap.theirs >= 0.1;
  const why: string[] = [];
  if (p.theyHave) {
    const pos = p.theyHave;
    why.push(`${cap(t.is)} ${ordinal(them.positions[pos].rank)} of ${strength.length} ${AREA_IN[pos]}, where ${w.is} ${ordinal(me.positions[pos].rank)}.`);
  }
  if (p.youHave) {
    const pos = p.youHave;
    why.push(`${cap(w.is)} ${ordinal(me.positions[pos].rank)} ${AREA_IN[pos]}, where ${t.is} ${ordinal(them.positions[pos].rank)}.`);
  }
  const list = (ids: number[]) => (
    <ul className="plain">
      {ids.map((id) => (
        <li key={id}>
          <PlayerName id={id} data={data} />
          <span className="pts">{(ratings.get(id) ?? 0).toFixed(1)}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <article className="card">
      <div className="tp-head">
        <Manager id={p.entryId} data={data} mine={myTeam} />
        <Tag tone={both ? "good" : "neutral"}>{both ? "Both XIs better" : `Better for ${w.name}`}</Tag>
      </div>
      {why.length > 0 && <p className="hint tp-why">{why.join(" ")}</p>}
      <div className="trade-sides">
        <div className="side">
          <div className="side-head">{cap(w.name)} {w.you ? "send" : "sends"}</div>
          {list(p.swap.give)}
        </div>
        <div className="side">
          <div className="side-head">{cap(w.name)} {w.you ? "get" : "gets"}</div>
          {list(p.swap.get)}
        </div>
      </div>
      <p className="tp-xi">
        {cap(w.their)} XI <Change n={p.swap.mine} /> · {cap(t.their)} XI <Change n={p.swap.theirs} />
      </p>
      <a className="link tp-open" href={checkerLink(me.entryId, p.entryId, p.swap.give, p.swap.get)}>
        Open in the trade checker
      </a>
    </article>
  );
}
