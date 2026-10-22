import { SubNav } from "./bits";
import type { LeagueData } from "./data";
import { PlayersPage } from "./PlayersPage";
import { SuggestionsPage } from "./SuggestionsPage";
import { TradeCheckerPage } from "./TradeCheckerPage";
import { TradePartnersPage } from "./TradePartnersPage";
import { TradesPage } from "./TradesPage";
import { WaiversPage } from "./WaiversPage";

export const MOVES_VIEWS = [
  { id: "trades", label: "Trades" },
  { id: "checker", label: "Trade checker" },
  { id: "partners", label: "Trade partners" },
  { id: "waivers", label: "Waivers" },
  { id: "suggestions", label: "Suggestions" },
  { id: "players", label: "Journeys" },
] as const;
export type MovesView = (typeof MOVES_VIEWS)[number]["id"];

export function MovesPage({ data, myTeam, view }: { data: LeagueData; myTeam: number | null; view: MovesView }) {
  return (
    <>
      <SubNav page="moves" views={MOVES_VIEWS} current={view} label="Moves sections" />
      {view === "trades" && <TradesPage data={data} myTeam={myTeam} />}
      {view === "checker" && <TradeCheckerPage data={data} myTeam={myTeam} />}
      {view === "partners" && <TradePartnersPage data={data} myTeam={myTeam} />}
      {view === "waivers" && <WaiversPage data={data} myTeam={myTeam} />}
      {view === "suggestions" && <SuggestionsPage data={data} myTeam={myTeam} />}
      {view === "players" && <PlayersPage data={data} myTeam={myTeam} />}
    </>
  );
}
