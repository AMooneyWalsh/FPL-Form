import { useMemo, useState } from "react";
import { passedThrough, playerJourney, type Stint } from "../../shared/moves";
import { Manager, PlayerName, playerSearchText } from "./bits";
import type { LeagueData } from "./data";

const HOW: Record<Stint["how"], string> = {
  draft: "Drafted",
  waiver: "Waiver",
  "free agent": "Free agent",
  trade: "Trade",
  unknown: "Signed",
};

export function PlayersPage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const [query, setQuery] = useState("");
  const moves = useMemo(() => ({ transactions: data.transactions, trades: data.trades, draft: data.draft }), [data]);

  // Every player who has belonged to anyone this season, with their journeys.
  const everOwned = useMemo(() => {
    const ids = new Set<number>();
    for (const gw of data.seasons.gameweeks) {
      for (const s of Object.values(gw.squads)) [...s.played, ...s.bench].forEach((id) => ids.add(id));
    }
    return [...ids].map((id) => ({ id, stints: playerJourney(id, data.seasons, moves) }));
  }, [data, moves]);

  const q = query.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const results = q
    ? everOwned.filter(({ id }) => {
        const p = data.players.get(id);
        return p && playerSearchText(p).includes(q);
      })
    : [];
  const travelled = [...everOwned]
    .filter((p) => new Set(p.stints.map((s) => s.entryId)).size > 1)
    .sort((a, b) => b.stints.length - a.stints.length || total(b.stints) - total(a.stints))
    .slice(0, 10);

  return (
    <>
      <section>
        <h2>Player journeys</h2>
        <p className="hint">Every manager a player has belonged to this season, and what he scored for each.</p>
        <input
          className="search"
          type="search"
          placeholder="Search a player, e.g. Saka"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {q && results.length === 0 && <p className="notice">Nobody in the league has owned a player matching that.</p>}
        {q && (
          <ul className="plain results">
            {results.slice(0, 20).map(({ id, stints }) => (
              <li key={id}>
                <PlayerName id={id} data={data} /> · {stints.length} {stints.length === 1 ? "owner" : "spells"}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!q && (
        <section>
          <h2>Most travelled</h2>
          {travelled.length === 0 && <p className="notice">Nobody has changed hands yet.</p>}
          {travelled.map(({ id, stints }) => (
            <Journey key={id} id={id} stints={stints} data={data} myTeam={myTeam} />
          ))}
        </section>
      )}
    </>
  );
}

/** One player's page (#/player/123): every manager he's belonged to. */
export function PlayerPage({ id, data, myTeam }: { id: number; data: LeagueData; myTeam: number | null }) {
  const stints = useMemo(
    () => playerJourney(id, data.seasons, { transactions: data.transactions, trades: data.trades, draft: data.draft }),
    [id, data],
  );
  if (!data.players.has(id)) return <p className="notice">Couldn't find that player.</p>;
  return (
    <section>
      <Journey id={id} stints={stints} data={data} myTeam={myTeam} />
      {stints.length === 0 && <p className="notice">Nobody in the league has owned him this season.</p>}
      <a className="link" href="#/moves/players">
        Search another player
      </a>
    </section>
  );
}

function Journey({ id, stints, data, myTeam }: { id: number; stints: Stint[]; data: LeagueData; myTeam: number | null }) {
  const owner = data.seasons.ownerAt(id, data.seasons.lastEvent);
  const hops = passedThrough(id, data.trades, data.seasons);
  return (
    <article className="card">
      <header className="card-head">
        <PlayerName id={id} data={data} />
        <span className="verdict">{owner ? `Now: ${data.labels.get(owner.entryId)}` : "Unowned now"}</span>
      </header>
      <ol className="journey">
        {stints.map((s, i) => (
          <li key={i} className={s.entryId === myTeam ? "is-mine" : undefined}>
            <span className="journey-who">
              <Manager id={s.entryId} data={data} />
            </span>
            <span className="journey-when">
              {HOW[s.how]}
              {s.draftPick ? ` #${s.draftPick}` : ""} · GW{s.from}
              {s.to !== s.from ? `–${s.to}` : ""}
            </span>
            <span className="journey-pts">{s.points} pts</span>
          </li>
        ))}
      </ol>
      {hops.length > 0 && (
        <p className="hint hops">
          Also passed through, traded on before playing:{" "}
          {hops.map((h) => `${data.labels.get(h.entryId)} (GW${h.event})`).join(", ")}
        </p>
      )}
    </article>
  );
}

function total(stints: Stint[]) {
  return stints.reduce((s, x) => s + x.points, 0);
}
