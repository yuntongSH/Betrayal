/**
 * The authoritative reducer. Every player intent flows through `reduce`, which
 * validates it against the current state and applies the rules: exploration,
 * card draws, the haunt roll, turn order, and (post-betrayal) combat.
 *
 * `reduce` mutates the state in place and returns it; the server owns the single
 * canonical state and snapshots it for the network as needed.
 */
import type { Action } from "./actions";
import type {
  CardEffect,
  CardId,
  CardType,
  Direction,
  GameState,
  PlacedRoom,
  PlayerId,
  PlayerState,
  Rotation,
} from "./types";
import { Rng } from "./rng";
import { ROOMS_BY_ID, getCard } from "./content";
import {
  addLog,
  effectiveTrait,
  getPlayer,
  hasTag,
  modTrait,
} from "./state";
import { drawCard, drawRoomForFloor } from "./decks";
import { connections, openDoors } from "./house";
import { hauntRoll, rollDice } from "./dice";
import {
  checkWinNow,
  monsterPhase,
  onTraitorTurnEnd,
  playerAttack,
  triggerHaunt,
} from "./haunt";
import {
  addBot,
  addPlayer,
  beginTurn,
  chooseCharacter,
  setConnected,
  startGame,
} from "./setup";
import { ALL_ROTATIONS, DIR_DELTA, neighborKey, worldDoorways } from "./grid";

function isActiveTurn(s: GameState, playerId: PlayerId): boolean {
  return (
    s.activePlayerId === playerId &&
    (s.phase === "explore" || s.phase === "haunt")
  );
}

function currentRoom(s: GameState, p: PlayerState): PlacedRoom | undefined {
  return p.position ? s.house[p.position] : undefined;
}

// ---------------------------------------------------------------------------
// Movement & exploration
// ---------------------------------------------------------------------------

function handleMoveTo(s: GameState, playerId: PlayerId, toKey: string): void {
  const p = getPlayer(s, playerId);
  if (!p?.alive || !isActiveTurn(s, playerId) || s.movementLeft <= 0) return;
  if (!p.position) return;
  if (!connections(s, p.position).includes(toKey)) return;

  p.position = toKey;
  s.movementLeft -= 1;
  const room = s.house[toKey];
  if (room) addLog(s, `${p.name} moves into the ${ROOMS_BY_ID[room.roomId]?.name ?? "room"}.`, "move");
  checkWinNow(s);
}

/** Choose a rotation so the new tile has a doorway facing back toward entry. */
function rotationFacing(roomId: string, mustFace: Direction): Rotation {
  const def = ROOMS_BY_ID[roomId];
  if (!def) return 0;
  for (const rot of ALL_ROTATIONS) {
    if (worldDoorways(def.doorways, rot).has(mustFace)) return rot;
  }
  return 0;
}

function handleExplore(s: GameState, playerId: PlayerId, door: Direction): void {
  const p = getPlayer(s, playerId);
  if (!p?.alive || !isActiveTurn(s, playerId) || s.movementLeft <= 0) return;
  const room = currentRoom(s, p);
  if (!room) return;
  if (!openDoors(s, p.position!).includes(door)) return;

  const newRoomId = drawRoomForFloor(s, room.floor);
  if (!newRoomId) {
    addLog(s, "The doorway opens onto bare, impossible wall. There is nowhere left to go this way.", "info");
    return;
  }

  const { dx, dy } = DIR_DELTA[door];
  const nx = room.x + dx;
  const ny = room.y + dy;
  const nKey = neighborKey(room.floor, room.x, room.y, door);
  const placed: PlacedRoom = {
    key: nKey,
    roomId: newRoomId,
    floor: room.floor,
    x: nx,
    y: ny,
    rotation: rotationFacing(newRoomId, opposite(door)),
    exploredBy: playerId,
  };
  s.house[nKey] = placed;

  p.position = nKey;
  // Discovering a previously-unseen room ends your movement for the turn.
  s.movementLeft = 0;
  const def = ROOMS_BY_ID[newRoomId];
  addLog(s, `${p.name} discovers the ${def?.name ?? "room"}.`, "move");

  applyRoomSpecial(s, p, placed);
  if (s.phase === "explore" || s.phase === "haunt") resolveRoomDraws(s, p, placed);
  checkWinNow(s);
}

function opposite(d: Direction): Direction {
  return d === "north" ? "south" : d === "south" ? "north" : d === "east" ? "west" : "east";
}

// ---------------------------------------------------------------------------
// Room specials & card draws
// ---------------------------------------------------------------------------

function applyRoomSpecial(s: GameState, p: PlayerState, room: PlacedRoom): void {
  const def = ROOMS_BY_ID[room.roomId];
  if (!def) return;
  switch (def.special) {
    case "heal-might":
      modTrait(s, p, "might", 1);
      addLog(s, `Something here steadies ${p.name}'s nerve. (+1 Might)`, "card");
      break;
    case "heal-sanity":
      modTrait(s, p, "sanity", 1);
      addLog(s, `A small mercy. ${p.name} breathes easier. (+1 Sanity)`, "card");
      break;
    case "drain-speed":
      modTrait(s, p, "speed", -1);
      addLog(s, `The air is thick as syrup. (${p.name} -1 Speed)`, "card");
      break;
    case "pit":
      modTrait(s, p, "might", -1);
      addLog(s, `${p.name} stumbles into the dark. (-1 Might)`, "card");
      break;
    case "vault":
      if (hasTag(p, "key")) {
        const card = drawCard(s, "item");
        if (card) {
          p.inventory.push(card);
          addLog(s, `The Iron Key turns. ${p.name} loots the vault!`, "card");
        }
      } else {
        addLog(s, "The vault is sealed. It wants a key.", "info");
      }
      break;
    case "draw-extra-omen":
      addLog(s, "The chamber drags the dark closer.", "info");
      drawAndResolve(s, p, "omen");
      break;
    case "mystic-elevator":
      addLog(
        s,
        "The iron cage shudders. Its dial spins — it will carry you between floors.",
        "info",
      );
      break;
    default:
      break;
  }
}

function resolveRoomDraws(s: GameState, p: PlayerState, room: PlacedRoom): void {
  const def = ROOMS_BY_ID[room.roomId];
  if (!def) return;
  for (const symbol of def.symbols) {
    if (s.phase !== "explore" && s.phase !== "haunt") return;
    drawAndResolve(s, p, symbol);
  }
}

function drawAndResolve(s: GameState, p: PlayerState, type: CardType): void {
  const cardId = drawCard(s, type);
  if (!cardId) {
    addLog(s, `The ${type} deck is spent.`, "info");
    return;
  }
  resolveCard(s, p, cardId);
}

function resolveCard(s: GameState, p: PlayerState, cardId: CardId): void {
  const card = getCard(cardId);
  if (!card) return;
  if (card.type === "event") {
    addLog(s, `${p.name} triggers an Event — ${card.name}: ${card.text}`, "card");
    applyEffect(s, p, card.effect);
    s.discards.event.push(cardId);
  } else if (card.type === "item") {
    addLog(s, `${p.name} picks up an Item — ${card.name}.`, "card");
    p.inventory.push(cardId);
  } else {
    addLog(s, `${p.name} uncovers an Omen — ${card.name}.`, "card");
    p.inventory.push(cardId);
    s.omenCount += 1;
    performHauntRoll(s, p, cardId);
  }
}

function applyEffect(s: GameState, p: PlayerState, effect: CardEffect): void {
  switch (effect.kind) {
    case "narrative":
      break;
    case "trait-mod":
    case "heal":
      modTrait(s, p, effect.trait, effect.delta);
      break;
    case "trait-roll": {
      const rng = Rng.fromState(s.rngState);
      const roll = rollDice(rng, effectiveTrait(p, effect.trait));
      s.rngState = rng.state;
      const passed = roll.total >= effect.difficulty;
      addLog(
        s,
        `${p.name} rolls ${effect.trait} — ${roll.total} vs ${effect.difficulty}: ${passed ? "success" : "failure"}.`,
        "roll",
        roll.dice,
      );
      applyEffect(s, p, passed ? effect.onPass : effect.onFail);
      break;
    }
    case "draw":
      for (let i = 0; i < effect.count; i++) drawAndResolve(s, p, effect.deck);
      break;
    case "item-passive":
    case "omen":
      break;
  }
}

function performHauntRoll(s: GameState, p: PlayerState, omenId?: CardId): void {
  const rng = Rng.fromState(s.rngState);
  const { roll, triggered } = hauntRoll(rng, s.omenCount);
  s.rngState = rng.state;
  addLog(
    s,
    `${p.name} makes the haunt roll: ${roll.total} vs ${s.omenCount} omen(s) in play.`,
    "roll",
    roll.dice,
  );
  if (triggered) triggerHaunt(s, p.id, omenId);
}

// ---------------------------------------------------------------------------
// Items on the floor — pickup & trade
// ---------------------------------------------------------------------------

function handlePickup(s: GameState, playerId: PlayerId, cardId: CardId): void {
  const p = getPlayer(s, playerId);
  if (!p?.alive || !isActiveTurn(s, playerId) || !p.position) return;
  const pile = s.itemPiles[p.position];
  if (!pile) return;
  const idx = pile.indexOf(cardId);
  if (idx < 0) return;
  pile.splice(idx, 1);
  if (pile.length === 0) delete s.itemPiles[p.position];
  p.inventory.push(cardId);
  addLog(s, `${p.name} takes the ${getCard(cardId)?.name ?? "item"} from the floor.`, "card");
  checkWinNow(s);
}

function handleGive(
  s: GameState,
  playerId: PlayerId,
  toPlayerId: PlayerId,
  cardId: CardId,
): void {
  const p = getPlayer(s, playerId);
  if (!p?.alive || !isActiveTurn(s, playerId) || !p.position) return;
  const target = getPlayer(s, toPlayerId);
  if (!target?.alive || target.id === p.id || target.position !== p.position) return;
  const idx = p.inventory.indexOf(cardId);
  if (idx < 0) return;
  p.inventory.splice(idx, 1);
  target.inventory.push(cardId);
  addLog(s, `${p.name} hands the ${getCard(cardId)?.name ?? "item"} to ${target.name}.`, "card");
  checkWinNow(s);
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function handleEndTurn(s: GameState, playerId: PlayerId): void {
  if (!isActiveTurn(s, playerId)) return;
  const p = getPlayer(s, playerId);

  // The monsters act on the traitor's turn — or, in a no-traitor "everyone vs.
  // the house" haunt, after every explorer's turn, since the house never rests.
  if (s.phase === "haunt") {
    const noTraitor = !!s.haunt && s.haunt.traitorIds.length === 0;
    if (p?.side === "traitor" || noTraitor) {
      monsterPhase(s);
      onTraitorTurnEnd(s);
    }
  }
  if (s.phase === "ended") return;

  advanceTurn(s);
}

function advanceTurn(s: GameState): void {
  const order = s.order;
  if (order.length === 0) return;
  const curIdx = s.activePlayerId ? order.indexOf(s.activePlayerId) : -1;
  for (let step = 1; step <= order.length; step++) {
    const idx = (curIdx + step) % order.length;
    const candidate = getPlayer(s, order[idx]!);
    if (candidate?.alive) {
      if (curIdx + step >= order.length) s.turn += 1;
      s.activePlayerId = candidate.id;
      beginTurn(s);
      checkWinNow(s);
      return;
    }
  }
  // No living players remain — let the haunt's win-check settle it.
  checkWinNow(s);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function reduce(s: GameState, action: Action): GameState {
  switch (action.type) {
    case "join":
      addPlayer(s, action.playerId, action.name, action.isBot ?? false);
      break;
    case "leave":
      setConnected(s, action.playerId, false);
      break;
    case "choose-character":
      chooseCharacter(s, action.playerId, action.characterId);
      break;
    case "add-bot": {
      const host = getPlayer(s, action.playerId);
      if (host?.isHost) addBot(s);
      break;
    }
    case "start-game": {
      const host = getPlayer(s, action.playerId);
      if (host?.isHost) startGame(s);
      break;
    }
    case "move-to":
      handleMoveTo(s, action.playerId, action.toKey);
      break;
    case "explore":
      handleExplore(s, action.playerId, action.door);
      break;
    case "attack":
      if (isActiveTurn(s, action.playerId)) {
        playerAttack(s, action.playerId, {
          monsterId: action.targetMonsterId,
          targetPlayerId: action.targetPlayerId,
        });
      }
      break;
    case "pickup-item":
      handlePickup(s, action.playerId, action.cardId);
      break;
    case "give-item":
      handleGive(s, action.playerId, action.toPlayerId, action.cardId);
      break;
    case "end-turn":
      handleEndTurn(s, action.playerId);
      break;
    case "resolve-card":
      break;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Read-only helpers for the client UI
// ---------------------------------------------------------------------------

export interface LegalMoves {
  explored: string[];
  doors: Direction[];
  attackMonsters: string[];
  attackPlayers: PlayerId[];
  /** Items lying on this room's floor that the player may pick up. */
  pickupItems: CardId[];
  /** Living explorers sharing this room that the player may hand items to. */
  tradePartners: PlayerId[];
  canEndTurn: boolean;
}

export function legalMoves(s: GameState, playerId: PlayerId): LegalMoves {
  const empty: LegalMoves = {
    explored: [],
    doors: [],
    attackMonsters: [],
    attackPlayers: [],
    pickupItems: [],
    tradePartners: [],
    canEndTurn: false,
  };
  const p = getPlayer(s, playerId);
  if (!p || !isActiveTurn(s, playerId) || !p.alive || !p.position) return empty;

  const moving = s.movementLeft > 0;
  const explored = moving ? connections(s, p.position) : [];
  const doors = moving ? openDoors(s, p.position) : [];

  const canAttack = s.attacksLeft > 0;
  const attackMonsters =
    canAttack && s.phase === "haunt" && s.haunt
      ? s.haunt.monsters
          .filter((m) => m.hp > 0 && m.position === p.position)
          .map((m) => m.id)
      : [];
  const attackPlayers =
    canAttack && s.phase === "haunt"
      ? s.players
          .filter(
            (o) => o.id !== p.id && o.alive && o.position === p.position && o.side !== p.side,
          )
          .map((o) => o.id)
      : [];

  const pickupItems = s.itemPiles[p.position] ? [...s.itemPiles[p.position]!] : [];
  const tradePartners = s.players
    .filter((o) => o.id !== p.id && o.alive && o.position === p.position)
    .map((o) => o.id);

  return {
    explored,
    doors,
    attackMonsters,
    attackPlayers,
    pickupItems,
    tradePartners,
    canEndTurn: true,
  };
}
