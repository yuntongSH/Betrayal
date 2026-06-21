import { useStore } from "../state/store";
import { Scene } from "../three/Scene";

/**
 * The in-game view: the 3D manor fills the screen, with a minimal status bar on
 * top. The full HUD (trait panel, event log, dice, haunt banner) layers on next.
 */
export function GameScreen() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const endTurn = useStore((s) => s.endTurn);

  const active = game.players.find((p) => p.id === game.activePlayerId);
  const myTurn = game.activePlayerId === myId;
  const haunt = game.phase === "haunt" || game.phase === "ended";

  return (
    <div className="game-shell">
      <Scene />

      <div className={`hud-top ${haunt ? "haunt" : ""}`}>
        <div className="hud-turn">
          {game.phase === "haunt" && <span className="haunt-tag">THE HAUNT · </span>}
          {game.phase === "ended" && <span className="haunt-tag">CONCLUDED · </span>}
          Round {game.turn} — {active?.name ?? "…"}
          {myTurn && <span className="you-tag"> (you)</span>}
        </div>
        {myTurn && game.phase !== "ended" && (
          <div className="hud-move">Movement left: {game.movementLeft}</div>
        )}
      </div>

      {myTurn && game.phase !== "ended" && (
        <button className="btn primary hud-endturn" onClick={endTurn}>
          End turn
        </button>
      )}

      {game.phase === "ended" && (
        <div className="hud-result">
          {game.winner === "heroes" ? "The Heroes Survive" : "The Traitor Triumphs"}
        </div>
      )}

      <div className="hud-hint">
        Drag to orbit · scroll to zoom · click a glowing room to move · click a
        flame arrow to explore
      </div>
    </div>
  );
}
