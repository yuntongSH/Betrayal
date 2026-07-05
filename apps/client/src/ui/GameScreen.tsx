import { useEffect, useMemo, useRef } from "react";
import { CHARACTERS_BY_ID, ROOMS_BY_ID, TRAITS, getCard, legalMoves, neighborKey } from "@dread-hollow/shared";
import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import { Portrait } from "./Portrait";
import { beatsBusy, useBeats } from "../state/beats";
import { ambient } from "../audio/ambient";
import { Scene } from "../three/Scene";
import { TraitPanel } from "./TraitPanel";
import { EventLog } from "./EventLog";
import { PartyRoster } from "./PartyRoster";
import { HauntBanner } from "./HauntBanner";
import { BeatOverlay } from "./BeatOverlay";
import { AudioToggle } from "./AudioToggle";
import { HelpButton } from "./HelpButton";
import { Minimap } from "./Minimap";
import { TRAIT_ICON, tagIcon } from "./icons";

/** When strictly nothing remains this turn, End turn shines and a visible
 *  countdown auto-ends it after this long (matches the .et-timer CSS drain). */
const AUTO_END_MS = 5000;

export function GameScreen() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const endTurn = useStore((s) => s.endTurn);
  const attackPlayer = useStore((s) => s.attackPlayer);
  const pickupItem = useStore((s) => s.pickupItem);
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

  // End-turn shine + auto-end: when it's MY turn and the engine says strictly
  // NOTHING remains (legal.nothingLeft), the button glows and a visible 5s
  // countdown ends the turn for me. Any state change restarts the countdown;
  // a card modal (worldFrozen) pauses it entirely — it restarts on dismissal.
  // The haunt-reveal banner (up or still gated) also holds the countdown.
  const worldFrozen = useBeats((s) => s.worldFrozen);
  const hauntSeen = useBeats((s) => s.hauntSeen);
  const hauntPending =
    game.phase === "haunt" && !!game.haunt && hauntSeen !== game.haunt.id;
  const shine =
    myTurn && !ended && !!legal?.nothingLeft && !worldFrozen && !hauntPending;
  // A per-state key restarts the .et-timer drain whenever the game changes.
  const shineSeq = useRef(0);
  const shineGame = useRef<typeof game | null>(null);
  if (shineGame.current !== game) {
    shineGame.current = game;
    shineSeq.current++;
  }
  useEffect(() => {
    if (!shine) return;
    const t = setTimeout(() => {
      // Re-check at the wire: a beat may have landed since (its modal shows a
      // breath later) — never end the turn under the player mid-reveal.
      if (!beatsBusy()) endTurn();
    }, AUTO_END_MS);
    return () => clearTimeout(t);
  }, [shine, game, endTurn]);

  // Keyboard movement (map-absolute) lives in <KeyboardMover/> inside the Canvas.

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
                <Portrait id={activeChar.id} />
              </span>
            )}
            {active?.name ?? "…"}
          </span>
          {myTurn && !ended && <span className="you-tag"> — your move</span>}
          {/* bot-turn cue — same wording as the artifact's turn chip */}
          {!myTurn && !ended && active?.isBot && (
            <span className="muted"> is taking their turn…</span>
          )}
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
            {legal?.canInvestigate && (
              <button
                className="btn act"
                onClick={investigate}
                title="Costs 1 step · Knowledge roll vs 4 — glimpse the next omen, or read a monster during the haunt"
              >
                <span className="bi">👁</span>
                <span>Investigate</span>
              </button>
            )}
            {legal?.canRest && (
              <button
                className="btn act"
                onClick={rest}
                title="Ends your movement · recover +1 on your most-wounded trait"
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
                  title="Costs 1 step · wedge this door shut for 3 rounds — nothing gets through either way"
                >
                  <span className="bi">⛓</span>
                  <span>Barricade → {nName}</span>
                </button>
              );
            })}
            <button className={`btn primary${shine ? " shine" : ""}`} onClick={endTurn}>
              <span className="bi">🕯</span>
              <span>End turn</span>
              {/* visible 5s countdown: a thin bar drains, then the turn ends */}
              {shine && (
                <span
                  key={shineSeq.current}
                  className="et-timer"
                  style={{ animationDuration: `${AUTO_END_MS}ms` }}
                />
              )}
            </button>
          </>
        )}
      </div>

      <Minimap />

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
        Drag to orbit · arrows walk by the map — ↑ north, ← west · click a
        glowing room, a flame arrow or the map · E ends your turn
        {game.phase === "haunt" ? " · click a monster to strike · ✦ spectral foes are fought with the mind" : ""}
      </div>
    </div>
  );
}
