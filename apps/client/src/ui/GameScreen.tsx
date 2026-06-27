import { useMemo } from "react";
import { getCard, legalMoves } from "@dread-hollow/shared";
import { useStore } from "../state/store";
import { Scene } from "../three/Scene";
import { TraitPanel } from "./TraitPanel";
import { EventLog } from "./EventLog";
import { PartyRoster } from "./PartyRoster";
import { HauntBanner } from "./HauntBanner";
import { AudioToggle } from "./AudioToggle";
import { HelpButton } from "./HelpButton";

export function GameScreen() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const endTurn = useStore((s) => s.endTurn);
  const attackPlayer = useStore((s) => s.attackPlayer);
  const pickupItem = useStore((s) => s.pickupItem);
  const notice = useStore((s) => s.notice);
  const error = useStore((s) => s.error);
  const status = useStore((s) => s.status);
  const roomCode = useStore((s) => s.roomCode);
  const name = useStore((s) => s.name);
  const joinRoom = useStore((s) => s.joinRoom);
  const leave = useStore((s) => s.leave);
  const lostConnection = status !== "connected" && !!error;

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

  // Keyboard movement (camera-relative) lives in <KeyboardMover/> inside the Canvas.

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

      {notice && <div className="hud-notice">{notice}</div>}

      {lostConnection && (
        <div
          className="hud-notice"
          style={{
            top: "auto",
            bottom: "5.5rem",
            display: "flex",
            gap: "0.6rem",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          {roomCode && (
            <button className="btn" onClick={() => joinRoom(roomCode, name)}>
              Reconnect
            </button>
          )}
          <button className="btn" onClick={leave}>
            Leave
          </button>
        </div>
      )}

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
