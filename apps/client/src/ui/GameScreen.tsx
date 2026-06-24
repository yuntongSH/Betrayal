import { useEffect, useMemo } from "react";
import { getCard, legalMoves, neighborKey, type Direction } from "@dread-hollow/shared";
import { useStore } from "../state/store";
import { Scene } from "../three/Scene";
import { TraitPanel } from "./TraitPanel";
import { EventLog } from "./EventLog";
import { PartyRoster } from "./PartyRoster";
import { HauntBanner } from "./HauntBanner";
import { AudioToggle } from "./AudioToggle";
import { HelpButton } from "./HelpButton";

const KEY_DIR: Record<string, Direction> = {
  ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east",
  w: "north", s: "south", a: "west", d: "east",
  W: "north", S: "south", A: "west", D: "east",
};

export function GameScreen() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const endTurn = useStore((s) => s.endTurn);
  const attackPlayer = useStore((s) => s.attackPlayer);
  const pickupItem = useStore((s) => s.pickupItem);
  const moveTo = useStore((s) => s.moveTo);
  const explore = useStore((s) => s.explore);

  const active = game.players.find((p) => p.id === game.activePlayerId);
  const myTurn = game.activePlayerId === myId;
  const ended = game.phase === "ended";
  const haunt = game.phase === "haunt" || ended;

  const legal = useMemo(
    () => (myId ? legalMoves(game, myId) : null),
    [game, myId],
  );
  const attackTargets = legal?.attackPlayers ?? [];
  const floorItems = legal?.pickupItems ?? [];

  // Keyboard: arrows / WASD to move, E to end turn.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!myTurn || ended) return;
      if ((e.key === "e" || e.key === "E")) {
        endTurn();
        return;
      }
      const dir = KEY_DIR[e.key];
      if (!dir || !legal) return;
      const me = game.players.find((p) => p.id === myId);
      const room = me?.position ? game.house[me.position] : undefined;
      if (!room) return;
      // Open doorway that way → discover; else a connected room that way → walk.
      if (legal.doors.includes(dir)) {
        e.preventDefault();
        explore(dir);
        return;
      }
      const target = neighborKey(room.floor, room.x, room.y, dir);
      if (legal.explored.includes(target)) {
        e.preventDefault();
        moveTo(target);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [myTurn, ended, endTurn, legal, game, myId, moveTo, explore]);

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
        <div className="hud-top-right">
          {myTurn && !ended && (
            <div className="hud-move">Movement left: {game.movementLeft}</div>
          )}
          <AudioToggle />
          <HelpButton />
        </div>
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
            {floorItems.map((cardId) => (
              <button
                key={cardId}
                className="btn"
                onClick={() => pickupItem(cardId)}
                title="Pick up from the floor"
              >
                Take {getCard(cardId)?.name ?? "item"}
              </button>
            ))}
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
            : game.haunt && game.haunt.traitorIds.length === 0
              ? "The House Prevails"
              : "The Traitor Triumphs"}
          <div className="hud-result-sub muted">{game.haunt?.name}</div>
        </div>
      )}

      <div className="hud-hint">
        Drag to orbit · arrow keys / WASD to move · click a glowing room or a
        flame arrow · E ends your turn
        {game.phase === "haunt" ? " · click a monster to strike · ✦ spectral foes are fought with the mind" : ""}
      </div>
    </div>
  );
}
