import { useStore } from "./state/store";
import { Lobby } from "./ui/Lobby";
import { RoomScreen } from "./ui/RoomScreen";
import { GameScreen } from "./ui/GameScreen";

export function App() {
  const game = useStore((s) => s.game);
  const error = useStore((s) => s.error);

  let view;
  if (!game) view = <Lobby />;
  else if (game.phase === "lobby") view = <RoomScreen />;
  else view = <GameScreen />;

  return (
    <div className="app">
      {view}
      {error && <div className="toast">{error}</div>}
    </div>
  );
}
