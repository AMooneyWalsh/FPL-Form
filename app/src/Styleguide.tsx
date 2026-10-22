import { useState } from "react";
import { isOut } from "../../shared/waivers";
import {
  Explainer,
  FoldSection,
  GameweekPicker,
  Manager,
  RowNo,
  PlayerName,
  Pts,
  ScrollTable,
  SectionHead,
  ShowFilter,
  StatTile,
  Tag,
  type TagTone,
} from "./bits";
import type { LeagueData } from "./data";

/**
 * #/styleguide: every token and shared piece on one page, in whichever theme the
 * phone is using. Not in the menus. The rules behind it are in docs/design-system.md.
 */

const COLOURS: { group: string; tokens: [string, string][] }[] = [
  {
    group: "Surfaces and text",
    tokens: [
      ["--bg", "Page background"],
      ["--surface", "Cards, tables, inputs"],
      ["--text", "Main text"],
      ["--muted", "Secondary text, hints"],
      ["--line", "Borders and dividers"],
    ],
  },
  {
    group: "Brand",
    tokens: [
      ["--brand", "Header, tabs, active chip"],
      ["--brand-text", "Text on the header"],
      ["--active-bg", "Selected chip"],
    ],
  },
  {
    group: "You",
    tokens: [
      ["--mine", "Your row or card, tinted"],
      ["--mine-edge", "The edge on your row, your card's border"],
      ["--mine-text", "Your name"],
    ],
  },
  {
    group: "Outcomes",
    tokens: [
      ["--good", "Win, plus points, top third"],
      ["--neutral", "Draw, nothing either way"],
      ["--bad", "Loss, minus points, bottom third"],
      ["--live", "Happening now"],
    ],
  },
  {
    group: "Status backgrounds",
    tokens: [
      ["--good-bg", "Good tag, winning side"],
      ["--warn-bg", "Doubtful, warning notice"],
      ["--bad-bg", "Out, error notice"],
    ],
  },
  {
    group: "Football",
    tokens: [
      ["--bonus", "Bonus badge"],
      ["--yellow-card", "Yellow card"],
      ["--fdr-1", "Easiest fixture"],
      ["--fdr-2", "Easy fixture"],
      ["--fdr-4", "Hard fixture"],
      ["--fdr-5", "Hardest fixture"],
    ],
  },
  {
    group: "Charts",
    tokens: [
      ["--series-1", "You"],
      ["--series-2", "Whoever you compare with"],
      ["--series-3", "Third series"],
      ["--series-4", "Fourth series"],
    ],
  },
];

const SIZES: [string, string, string][] = [
  ["--fs-xxl", "32px", "Hero number (head to head score)"],
  ["--fs-xl", "22px", "Page title, match scores"],
  ["--fs-lg", "18px", "Section titles, stat tiles"],
  ["--fs-md", "15px", "Body text, names in lists"],
  ["--fs-sm", "13px", "Hints, details, table text"],
  ["--fs-xs", "11px", "Tags, badges, column headings"],
];

const TONES: TagTone[] = ["good", "warn", "bad", "neutral", "mine", "live"];

export function Styleguide({ data, myTeam }: { data: LeagueData; myTeam: number | null }) {
  const [who, setWho] = useState<number | null>(null);
  const [gw, setGw] = useState(5);
  const players = [...data.players.values()];
  const injured = players.find((p) => isOut(p));
  const doubtful = players.find((p) => p.status === "d");
  const someone = [...data.entries.keys()].find((id) => id !== myTeam) ?? myTeam;

  return (
    <>
      <section>
        <h2>Style guide</h2>
        <p className="hint">
          Every colour, size and building block the site uses. The rules for using them are in the project's design
          notes.
        </p>
      </section>

      <section>
        <h2>Colours</h2>
        {COLOURS.map((g) => (
          <div key={g.group}>
            <h3>{g.group}</h3>
            <ul className="plain sg-swatches">
              {g.tokens.map(([token, use]) => (
                <li key={token}>
                  <span className="sg-swatch" style={{ background: `var(${token})` }} />
                  <span>
                    <code>{token}</code>
                    <span className="hint sg-use">{use}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2>Text sizes</h2>
        <div className="card">
          {SIZES.map(([token, px, use]) => (
            <div key={token} className="sg-type">
              <span style={{ fontSize: `var(${token})`, fontWeight: 700 }}>Drafty In Here</span>
              <span className="hint">
                <code>{token}</code> {px} · {use}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Corners and spacing</h2>
        <div className="sg-row">
          {["--r-sm", "--r-md", "--r-lg", "--r-pill"].map((r) => (
            <div key={r} className="sg-corner" style={{ borderRadius: `var(${r})` }}>
              <code>{r}</code>
            </div>
          ))}
        </div>
        <div className="sg-spaces">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="sg-space">
              <span style={{ width: `var(--sp-${n})` }} />
              <code>--sp-{n}</code>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Section header">
          <ShowFilter data={data} value={who} onChange={setWho} myTeam={myTeam} />
        </SectionHead>
        <p className="hint">A title with its controls on the right. Under it, one short line of hint at most.</p>
        <Explainer>
          <p>Longer explanations go in here, folded away, so the numbers come first.</p>
          <p>Use it for anything over one line: how a score is worked out, what a column means.</p>
        </Explainer>
      </section>

      <section>
        <h2>Folding</h2>
        <FoldSection title="Gameweek 6" count="4 battles" open>
          <div className="card">
            <button className="fold-btn" aria-expanded={false}>
              <span className="fold-row">
                <strong>A card that opens on tap</strong>
                <Tag tone="live">Live</Tag>
              </span>
              <span className="fold-row fold-meta">
                <span>14:00 · FT</span>
                <span className="fold-summary">Folded, it shows a one-line summary</span>
              </span>
            </button>
          </div>
        </FoldSection>
        <FoldSection title="Gameweek 5" count="12 battles">
          <p className="hint">Older groups start folded.</p>
        </FoldSection>
      </section>

      <section>
        <h2>Tags</h2>
        <div className="sg-row">
          {TONES.map((t) => (
            <Tag key={t} tone={t}>
              {t}
            </Tag>
          ))}
        </div>
        <p className="hint">
          In use: {injured && <PlayerName id={injured.id} data={data} />}
          {doubtful && (
            <>
              {", "}
              <PlayerName id={doubtful.id} data={data} />
            </>
          )}
          , <Tag tone="good">Starting</Tag> <Tag tone="warn">Bench</Tag> <Tag tone="bad">Not in squad</Tag>
        </p>
      </section>

      <section>
        <h2>Results and numbers</h2>
        <p>
          Form{" "}
          <span className="form">
            <span className="chip W">W</span>
            <span className="chip D">D</span>
            <span className="chip L">L</span>
          </span>{" "}
          · points <Pts n={12} signed /> <Pts n={-7} signed /> <Pts n={0} signed />
        </p>
        <div className="stat-row">
          <StatTile label="Position" value="1st" />
          <StatTile label="Scored" value="269" rank={{ text: "Highest in league", tone: "good" }} />
          <StatTile label="Bench pts" value="32" rank={{ text: "3rd most", tone: "bad" }} />
          <StatTile label="Trades" value="2" rank={{ text: "Joint 5th", tone: "meh" }} />
        </div>
        <p className="hint">
          Fixture difficulty: <span className="fdr fdr-1">EVE (H)</span>
          <span className="fdr fdr-2">FUL (A)</span>
          <span className="fdr fdr-3">BRE (H)</span>
          <span className="fdr fdr-4">ARS (A)</span>
          <span className="fdr fdr-5">MCI (A)</span>
        </p>
      </section>

      <section>
        <h2>Names and links</h2>
        <p>
          Your name: {myTeam !== null ? <Manager id={myTeam} data={data} mine={myTeam} /> : "pick your team to see it"} ·
          someone else: {someone !== null && <Manager id={someone} data={data} mine={myTeam} />}
        </p>
        <p>
          <a className="link" href="#/league/table">
            A link to another page
          </a>
        </p>
      </section>

      <section>
        <h2>Chips</h2>
        <div className="chips">
          <span className="chip-btn active">Selected</span>
          <span className="chip-btn">Not selected</span>
          <span className="chip-btn">Another</span>
        </div>
      </section>

      <section>
        <h2>Gameweek picker</h2>
        <p className="hint">Steps through gameweeks, with a way back to the latest. Used by the weekly recap; the Live tab has the same look.</p>
        <GameweekPicker event={gw} max={7} home={7} onPick={setGw} />
      </section>

      <section>
        <h2>Table</h2>
        <p className="hint">On a phone it scrolls sideways; the first column stays put.</p>
        <ScrollTable>
          <table className="data">
            <thead>
              <tr>
                <th className="left">Manager</th>
                <th className="num">Pts</th>
                <th className="num">Net</th>
                <th className="num">Trades</th>
                <th className="num">Won</th>
                <th className="num">Lost</th>
                <th className="left">Trades most with</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="left">
                  <RowNo>1</RowNo>Someone
                </td>
                <td className="num strong">291</td>
                <td className="num">
                  <Pts n={25} signed />
                </td>
                <td className="num">4</td>
                <td className="num">3</td>
                <td className="num">1</td>
                <td className="left">Someone else (2)</td>
              </tr>
              <tr className="mine">
                <td className="left">
                  <RowNo>2</RowNo>You
                </td>
                <td className="num strong">286</td>
                <td className="num">
                  <Pts n={-12} signed />
                </td>
                <td className="num">2</td>
                <td className="num">0</td>
                <td className="num">2</td>
                <td className="left">Someone (2)</td>
              </tr>
              <tr>
                <td className="left">
                  <RowNo>3</RowNo>Someone else
                </td>
                <td className="num strong">261</td>
                <td className="num">
                  <Pts n={0} signed />
                </td>
                <td className="num">1</td>
                <td className="num">0</td>
                <td className="num">0</td>
                <td className="left">You (1)</td>
              </tr>
            </tbody>
          </table>
        </ScrollTable>
      </section>

      <section>
        <h2>Cards and notices</h2>
        <div className="card">
          <h3 className="card-title">A card</h3>
          <p className="hint">White on the page background, a thin border and large corners.</p>
        </div>
        <div className="card mine-card">
          <h3 className="card-title">Your card</h3>
          <p className="hint">Same card with a purple border when it's about you.</p>
        </div>
        <p className="notice">A plain notice: nothing to show yet.</p>
        <p className="notice warn">A warning: some data is from the last saved copy.</p>
        <p className="notice error">An error: couldn't load the league.</p>
      </section>
    </>
  );
}
