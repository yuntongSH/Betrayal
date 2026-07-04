import { useEffect, useMemo } from "react";
import { CHARACTERS_BY_ID, ROOMS_BY_ID, TRAITS, getCard, legalMoves, neighborKey } from "@dread-hollow/shared";
import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { ambient } from "../audio/ambient";
import { Scene } from "../three/Scene";
import { TraitPanel } from "./TraitPanel";
import { EventLog } from "./EventLog";
import { PartyRoster } from "./PartyRoster";
import { HauntBanner } from "./HauntBanner";
import { BeatOverlay } from "./BeatOverlay";
import { AudioToggle } from "./AudioToggle";
import { HelpButton } from "./HelpButton";
import { TRAIT_ICON, tagIcon } from "./icons";

export function GameScreen() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const endTurn = useStore((s) => s.endTurn);
  const attackPlayer = useStore((s) => s.attackPlayer);
  const pickupItem = useStore((s) => s.pickupItem);
  const search = useStore((s) => s.search);
  const rest = useStore((s) => s.rest);
  const barricade = useStore((s) => s.barricade);
  const investigate = useStore((s) => s.investigate);
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

  // Movement pips: the active explorer's Speed as winged-boot icons, spent
  // ones dimmed; overflow beyond eight collapses into a "+N".
  const activeChar = active?.characterId ? CHARACTERS_BY_ID[active.characterId] : undefined;
  const spd = activeChar && active ? activeChar.traits.speed.values[active.traitIndex.speed]! : 0;
  const pipTotal = Math.min(8, Math.max(spd, game.movementLeft));
  const pipLit = Math.min(game.movementLeft, 8);

  // Reactive heartbeat: thuds while your explorer is one step from the skull.
  const me = game.players.find((p) => p.id === myId);
  const peril =
    !ended && !!me?.alive && !!me.characterId &&
    TRAITS.some((t) => (me.traitIndex[t] ?? 9) <= 1);
  useEffect(() => {
    ambient.setHeart(peril);
    return () => ambient.setHeart(false);
  }, [peril]);

  const legal = useMemo(
    () => (myId ? legalMoves(game, myId) : null),
    [game, myId],
  );
  const attackTargets = legal?.attackPlayers ?? [];
  const floorItems = legal?.pickupItems ?? [];
  const barricadeDoors = legal?.barricadeDoors ?? [];
  const myRoom = active && active.position ? game.house[active.position] : null;

  // Keyboard movement (camera-relative) lives in <KeyboardMover/> inside the Canvas.

  return (
    <div className="game-shell">
      <Scene />

      <div className={`hud-top ${haunt ? "haunt" : ""}`}>
        <div className="hud-turn">
          {game.phase === "haunt" && <span className="haunt-tag">THE HAUNT · </span>}
          {ended && <span className="haunt-tag">CONCLUDED · </span>}
          <span className="round-chip">Round {game.turn}</span>
          <span className="turn-chip">
            {activeChar && (
              <span
                className="roster-avatar"
                style={{ "--pc": activeChar.color } as CSSProperties}
              >
                {activeChar.name.charAt(0)}
              </span>
            )}
            {active?.name ?? "…"}
          </span>
          {myTurn && !ended && <span className="you-tag"> — your move</span>}
        </div>
        <div className="hud-top-right">
          {!ended && (
            <div className="hud-move" title={`Movement left: ${game.movementLeft}`}>
              {Array.from({ length: pipTotal }, (_, i) => (
                <span
                  key={i}
                  className={`mp${i < pipLit ? "" : " spent"}`}
                  dangerouslySetInnerHTML={{ __html: TRAIT_ICON.speed }}
                />
              ))}
              {game.movementLeft > 8 && (
                <span className="mp-more">+{game.movementLeft - 8}</span>
              )}
            </div>
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
                <span className="bi">{tagIcon(cardId)}</span>
                <span>Take {getCard(cardId)?.name ?? "item"}</span>
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
                  <span className="bi">⚔</span>
                  <span>Attack {name}</span>
                </button>
              );
            })}
            {legal?.canSearch && (
              <button
                className="btn act"
                onClick={search}
                title="Rummage this room for an item — but you might disturb something (costs 1 step)"
              >
                <span className="bi">🔍</span>
                <span>Search</span>
              </button>
            )}
            {legal?.canInvestigate && (
              <button
                className="btn act"
                onClick={investigate}
                title="A Knowledge check to read the danger ahead (costs 1 step)"
              >
                <span className="bi">👁</span>
                <span>Investigate</span>
              </button>
            )}
            {legal?.canRest && (
              <button
                className="btn act"
                onClick={rest}
                title="Catch your breath to recover your most-wounded trait — ends your movement"
              >
                <span className="bi">✚</span>
                <span>Steady</span>
              </button>
            )}
            {barricadeDoors.map((dir) => {
              const nKey = myRoom
                ? neighborKey(myRoom.floor, myRoom.x, myRoom.y, dir)
                : null;
              const nName =
                nKey && game.house[nKey]
                  ? ROOMS_BY_ID[game.house[nKey]!.roomId]?.name ?? dir
                  : dir;
              return (
                <button
                  key={`barricade-${dir}`}
                  className="btn act"
                  onClick={() => barricade(dir)}
                  title="Wedge this door shut so nothing follows for a few rounds (costs 1 step)"
                >
                  <span className="bi">⛓</span>
                  <span>Barricade → {nName}</span>
                </button>
              );
            })}
            <button className="btn primary" onClick={endTurn}>
              <span className="bi">🕯</span>
              <span>End turn</span>
            </button>
          </>
        )}
      </div>

      <BeatOverlay />
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
