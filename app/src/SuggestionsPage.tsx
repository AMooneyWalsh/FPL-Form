import { useMemo, useState } from "react";
import type { Player } from "../../shared/types";
import { isOut, waiverSuggestions, weakestAt, type FixtureRunItem } from "../../shared/waivers";
import { PlayerName } from "./bits";
import type { LeagueData } from "./data";

const POSITIONS = ["All", "GKP", "DEF", "MID", "FWD"] as const;
type Filter = (typeof POSITIONS)[number];
const SHOWN = 15;

export function SuggestionsPage({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const [pos, setPos] = useState<Filter>("All");
  const all = useMemo(() => waiverSuggestions(data.playerList, data.owners, data.fixtures), [data]);
  const clubs = useMemo(() => new Map(data.playerList.map((p) => [p.teamId, p.team])), [data]);
  const mySquad = useMemo(
    () => (myTeam === null ? [] : data.playerList.filter((p) => data.owners.get(p.id) === myTeam)),
    [data, myTeam],
  );
  const shown = all.filter((s) => pos === "All" || s.player.position === pos).slice(0, SHOWN);
  const worries = mySquad.filter((p) => p.status !== "a");

  return (
    <>
      {myTeam !== null && worries.length > 0 && (
        <section>
          <h2>Your injury worries</h2>
          <ul className="plain facts">
            {worries.map((p) => (
              <li key={p.id}>
                <PlayerName id={p.id} data={data} />
                {p.news && <div className="player-meta">{p.news}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Waiver suggestions</h2>
        <p className="hint">
          The best free agents right now. The rating mixes recent form (60%) with points a game this season (40%),
          then goes up for easy fixtures and down for hard ones. Anyone injured or suspended is left out, and doubts
          are marked down by their chance of playing.
          {myTeam !== null && " Each one suggests who in your squad to drop."}
        </p>
        <div className="chips small" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p} className={pos === p ? "chip-btn active" : "chip-btn"} onClick={() => setPos(p)}>
              {p === "All" ? "All" : p}
            </button>
          ))}
        </div>
        {shown.length === 0 && <p className="notice">No free agents to suggest in that position.</p>}
        {shown.map((s, i) => (
          <article key={s.player.id} className="card sugg">
            <div className="sugg-head">
              <span>
                <span className="player-meta">{i + 1}.</span> <PlayerName id={s.player.id} data={data} />
              </span>
              <span className="sugg-rating" title="Rating">
                {s.rating}
              </span>
            </div>
            <div className="sugg-stats">{stats(s.player)}</div>
            <Fixtures run={s.fixtures} clubs={clubs} />
            {myTeam !== null && <Drop squad={mySquad} p={s.player} data={data} />}
          </article>
        ))}
      </section>

      <p className="hint">
        Fixture colours are FPL's own difficulty ratings: green is easy, red is hard.
        {!data.officialDifficulty &&
          " FPL's ratings couldn't be loaded just now, so these are an estimate from each club's FPL points this season."}
      </p>
    </>
  );
}

function stats(p: Player): string {
  const parts = [
    `Form ${p.form.toFixed(1)}`,
    `${p.totalPoints} pts`,
    `${p.pointsPerGame.toFixed(1)} a game`,
    `${p.starts} starts`,
  ];
  if (p.position !== "GKP") parts.push(`xGI ${(p.xg + p.xa).toFixed(1)}`);
  if (p.penaltiesOrder === 1) parts.push("on penalties");
  return parts.join(" · ");
}

function Fixtures({ run, clubs }: { run: FixtureRunItem[]; clubs: Map<number, string> }) {
  if (run.length === 0) return null;
  return (
    <div>
      {run.map((f) => (
        <span key={`${f.event}-${f.opponent}`} className={`fdr fdr-${f.difficulty}`} title={`Gameweek ${f.event}`}>
          {clubs.get(f.opponent) ?? "?"} ({f.home ? "H" : "A"})
        </span>
      ))}
    </div>
  );
}

function Drop({ squad, p, data }: { squad: Player[]; p: Player; data: LeagueData }) {
  const drop = weakestAt(squad, p.position);
  if (!drop) return null;
  const better = isOut(drop) || p.form > drop.form;
  if (!better) return <div className="sugg-drop muted">Not in better form than your {p.position}s.</div>;
  return (
    <div className="sugg-drop">
      Drop <PlayerName id={drop.id} data={data} detail={false} />{" "}
      <span className="player-meta">
        {isOut(drop) ? "(out)" : `(form ${drop.form.toFixed(1)})`}
      </span>
    </div>
  );
}
