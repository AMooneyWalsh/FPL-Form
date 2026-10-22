import { Fragment, useEffect, useMemo, useState } from "react";
import { finishedGameweeks, gameweekRecap, recapWords, type RecapAward, type RecapMatch } from "../../shared/recap";
import { Explainer, GameweekPicker, hashParams, Manager, replaceHashParams } from "./bits";
import type { LeagueData } from "./data";

/**
 * League > Recap (#/league/recap?gw=7): an auto-written roundup of one
 * finished gameweek. Headlines, every result, then the awards. The facts and
 * the words come from shared/recap.ts; this only lays them out.
 */
export function RecapView({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const finished = useMemo(() => finishedGameweeks(data.league), [data.league]);
  const [asked, setAsked] = useState(linkedGameweek);
  // A link to another week opened while already here.
  useEffect(() => {
    const onChange = () => setAsked(linkedGameweek());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const latest = finished.at(-1) ?? null;
  const event = asked !== null && finished.includes(asked) ? asked : latest;
  const recap = useMemo(() => {
    if (event === null) return null;
    const facts = gameweekRecap({ league: data.league, seasons: data.seasons, trades: data.trades, transactions: data.transactions }, event);
    const words = recapWords(facts, {
      manager: (id) => data.labels.get(id) ?? "Someone",
      player: (id) => data.players.get(id)?.name ?? "someone",
    });
    return { facts, words };
  }, [data, event]);

  if (event === null || latest === null || recap === null) {
    return <p className="notice">The first recap appears once gameweek 1 is finished.</p>;
  }
  const pick = (n: number) => {
    setAsked(n);
    replaceHashParams({ gw: n });
  };
  const { facts, words } = recap;

  return (
    <>
      <section>
        <GameweekPicker event={event} min={finished[0]} max={latest} home={latest} onPick={pick} />
        <div className="card recap-lead">
          {words.headlines.map((h) => (
            <p key={h}>{h}</p>
          ))}
        </div>
      </section>

      <section>
        <h2>Results</h2>
        <ul className="plain card recap-results">
          {facts.matches.map((m) => (
            <ResultRow key={m.home} m={m} data={data} myTeam={myTeam} />
          ))}
        </ul>
      </section>

      <section>
        <h2>Awards</h2>
        <Explainer label="How the awards are picked">
          <p>
            Jammiest win goes to the lowest winning score, but only if it was below the league's middle score that week.
            Most robbed is the highest losing score, if it was above it. Bench of shame needs at least 5 points on the
            bench, and a climb or fall of one place doesn't count.
          </p>
          <p>
            Player of the week only counts players in someone's starting XI. Signing of the week is the best waiver or
            free agent pick-up that week, by points in the XI. Trade of the week is the trade made for that gameweek
            with the biggest lead after its first week, scored like the trade cards. Ties name everyone.
          </p>
        </Explainer>
        <div className="recap-awards">
          {words.awards.map((a, i) => (
            <AwardCard key={`${a.id}-${i}`} a={a} data={data} myTeam={myTeam} />
          ))}
        </div>
      </section>
    </>
  );
}

function linkedGameweek(): number | null {
  const gw = Number(hashParams().get("gw"));
  return Number.isInteger(gw) && gw > 0 ? gw : null;
}

/** "Ben 64 – 51 Daire", winner in bold, your match highlighted. */
function ResultRow({ m, data, myTeam }: { m: RecapMatch; data: LeagueData; myTeam: number | null }) {
  const mine = m.home === myTeam || m.away === myTeam;
  const won = (id: number) => (m.winner === id ? " won" : "");
  return (
    <li className={mine ? "recap-result is-mine" : "recap-result"}>
      <span className={`rr-name rr-home${won(m.home)}`}>
        <Manager id={m.home} data={data} mine={myTeam} />
      </span>
      <span className="rr-score">
        <span className={won(m.home)}>{m.homeScore}</span>
        <span className="muted"> – </span>
        <span className={won(m.away)}>{m.awayScore}</span>
      </span>
      <span className={`rr-name${won(m.away)}`}>
        <Manager id={m.away} data={data} mine={myTeam} />
      </span>
    </li>
  );
}

function AwardCard({ a, data, myTeam }: { a: RecapAward; data: LeagueData; myTeam: number | null }) {
  const mine = myTeam !== null && a.entryIds.includes(myTeam);
  // Match awards come in pairs: "Ross v Ruairi G".
  const size = a.versus ? 2 : 1;
  const groups: number[][] = [];
  for (let i = 0; i < a.entryIds.length; i += size) groups.push(a.entryIds.slice(i, i + size));
  return (
    <article className={`card award${mine ? " mine-card" : ""}`}>
      <div className="award-title">{a.title}</div>
      <div className="award-who">
        {groups.map((ids, i) => (
          <Fragment key={ids.join("-")}>
            {i > 0 && (i === groups.length - 1 ? " and " : ", ")}
            {ids.map((id, k) => (
              <Fragment key={id}>
                {k > 0 && " v "}
                <Manager id={id} data={data} mine={myTeam} />
              </Fragment>
            ))}
          </Fragment>
        ))}
      </div>
      <div className={`award-stat ${a.tone}`}>{a.stat}</div>
      <p className="award-line">{a.line}</p>
    </article>
  );
}
