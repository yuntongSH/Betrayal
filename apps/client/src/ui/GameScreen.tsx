import { useStore } from "../state/store";

/**
 * Placeholder in-game view. The 3D manor and the full HUD are layered on top of
 * this shell in subsequent updates.
 */
export function GameScreen() {
  const game = useStore((s) => s.game)!;
  const rooms = Object.keys(game.house).length;

  return (
    <div className="game-shell">
      <div className="game-loading">
        <h2>The manor stirs…</h2>
        <p className="muted">
          {rooms} room{rooms === 1 ? "" : "s"} stand. Turn {game.turn}. The 3D
          view is being raised from the foundations.
        </p>
      </div>
    </div>
  );
}
