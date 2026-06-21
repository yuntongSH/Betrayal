import { useMemo } from "react";
import { legalMoves } from "@dread-hollow/shared";
import { useStore } from "../state/store";
import { Scene } from "../three/Scene";
import { TraitPanel } from "./TraitPanel";
import { EventLog } from "./EventLog";
import { PartyRoster } from "./PartyRoster";
import { HauntBanner } from "./HauntBanner";

export function GameScreen() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const endTurn = useStore((s) => s.endTurn);
  const attackPlayer = useStore((s) => s.attackPlayer);

  const active = game.players.find((p) => p.id === game.activePlayerId);
  const myTurn = game.activePlayerId === myId;
  const ended = game.phase === "ended";
  const haunt = game.phase === "haunt" || ended;

  const legal = useMemo(
    () => (myId ? legalMoves(game, myId) : null),
    [game, myId],
  );
  const attackTargets = legal?.attackPlayers ?? [];

  return (
    <div className="game-shell">
      <Scene />

      <div className={`hud-top ${haunt ? "haunt" : ""}`}>
        <div className="hud-turn">
          {game.phase === "haunt" && <span className="haunt-tag">THE HAUNT · </span>}
          {ended && <span className="haunt-tag">CONCLUDED · </span>}
          Round {game.turn} — {active?.name ?? "…"}
          {myTurn && !ended && <span className="you-tag"> (your move)</span>}
        </div>
        {myTurn && !ended && (
          <div className="hud-move">Movement left: {game.movementLeft}</div>
        )}
      </div>

      <div className="hud-left">
        <PartyRoster />
        <EventLog />
      </div>

      <div className="hud-right">
        <TraitPanel />
      </div>

      <div className="hud-bottom">
        {myTurn && !ended && (
          <>
            {attackTargets.map((id) => {
              const name = game.players.find((p) => p.id === id)?.name ?? "foe";
              return (
                <button
                  key={id}
                  className="btn danger"
                  onClick={() => attackPlayer(id)}
                >
                  Attack {name}
                </button>
              );
            })}
            <button className="btn primary" onClick={endTurn}>
              End turn
            </button>
          </>
        )}
      </div>

      <HauntBanner />

      {ended && (
        <div className="hud-result">
          {game.winner === "heroes"
            ? "The Heroes Survive"
            : "The Traitor Triumphs"}
          <div className="hud-result-sub muted">{game.haunt?.name}</div>
        </div>
      )}

      <div className="hud-hint">
        Drag to orbit · click a glowing room to move · click a flame arrow to
        explore{game.phase === "haunt" ? " · click a monster to strike" : ""}
      </div>
    </div>
  );
}
