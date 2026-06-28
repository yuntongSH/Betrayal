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
  livingPlayers,
  modTrait,
  roomAura,
} from "./state";
import { drawCard, drawRoomForFloor, hasRoomForFloor } from "./decks";
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
  // Discovering a new room costs a single step, like any move — so you can keep
  // walking and backtrack while you still have movement left this turn (rather
  // than the discovery ending your whole turn's movement).
  s.movementLeft -= 1;
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
  if (def.aura) {
    addLog(
      s,
      def.aura > 0
        ? `The air here is still and clean. Your hand steadies while you remain. (+${def.aura} die)`
        : `Dread soaks these walls. Every effort falters while you remain. (${def.aura} dice)`,
      "info",
    );
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
    case "heal": {
      const speedBefore = effectiveTrait(p, "speed");
      modTrait(s, p, effect.trait, effect.delta);
      // A mid-turn Speed gain must extend THIS turn's movement budget — it is
      // otherwise only set at beginTurn — so a "+2 Speed" consumable (Quicksilver
      // Elixir) actually lets you move farther on the turn you drink it.
      if (effect.trait === "speed" && p.alive && p.id === s.activePlayerId) {
        const gained = effectiveTrait(p, "speed") - speedBefore;
        if (gained > 0) s.movementLeft += gained;
      }
      break;
    }
    case "trait-roll": {
      const rng = Rng.fromState(s.rngState);
      const roll = rollDice(rng, Math.max(0, effectiveTrait(p, effect.trait) + roomAura(s, p)));
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
    case "consumable":
    case "omen":
      break;
  }
}

function performHauntRoll(s: GameState, p: PlayerState, omenId?: CardId): void {
  // The betrayal happens once. An omen drawn during the haunt (exploring still
  // resolves room symbols) must not roll again and re-trigger/overwrite it.
  if (s.phase === "haunt" || s.haunt) return;
  const rng = Rng.fromState(s.rngState);
  const { roll, triggered } = hauntRoll(rng, s.omenCount);
  s.rngState = rng.state;
  addLog(
    s,
    `${p.name} makes the haunt roll: ${roll.total} vs ${s.omenCount} omen(s) in play.`,
    "roll",
    roll.dice,
  );
  // Safety against an explore-phase soft-lock: once the omen deck is spent there
  // can be no further haunt rolls, so the final omen must always turn the house
  // even on an unlucky roll — otherwise the game could wander forever.
  const forced = !triggered && s.decks.omen.length === 0;
  if (forced) {
    addLog(s, "The last omen falls into place — the house can hold back no longer.", "haunt");
  }
  if (triggered || forced) triggerHaunt(s, p.id, omenId);
}

// ---------------------------------------------------------------------------
// Items on the floor — pickup & trade
// ---------------------------------------------------------------------------

function handleUseItem(s: GameState, playerId: PlayerId, cardId: CardId): void {
  const p = getPlayer(s, playerId);
  if (!p?.alive || !isActiveTurn(s, playerId)) return;
  const idx = p.inventory.indexOf(cardId);
  if (idx < 0) return;
  const card = getCard(cardId);
  if (!card || card.effect.kind !== "consumable") return;
  // Spend it before applying, so an effect that draws can't re-trigger this one.
  p.inventory.splice(idx, 1);
  s.discards.item.push(cardId);
  addLog(s, `${p.name} uses the ${card.name}.`, "card");
  applyEffect(s, p, card.effect.use);
  checkWinNow(s);
}

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
  } else if (s.phase === "explore") {
    // The explore phase has its own dawn-breaker: the betrayal must eventually
    // come. If the house can grow no further (no drawable room for any floor with
    // an open door) or the night has simply dragged on too long, force the haunt
    // so the game always reaches its second act instead of wandering forever.
    forceHauntIfStalled(s, playerId);
  }
  // Catches a game ended by the monster phase OR by the forced haunt above.
  if (s.phase === "ended") return;

  advanceTurn(s);
}

/** Rounds the explore phase may run before the house turns on its own. */
const EXPLORE_ROUND_LIMIT = 50;

function forceHauntIfStalled(s: GameState, playerId: PlayerId): void {
  if (s.phase !== "explore" || s.haunt) return;
  // Floors that still have at least one open doorway a room could be placed at.
  const openFloors = new Set(
    Object.values(s.house)
      .filter((r) => openDoors(s, r.key).length > 0)
      .map((r) => r.floor),
  );
  const canExpand = [...openFloors].some((f) => hasRoomForFloor(s, f));
  if (canExpand && s.turn < EXPLORE_ROUND_LIMIT) return;

  const triggerId = getPlayer(s, playerId)?.alive ? playerId : livingPlayers(s)[0]?.id;
  if (!triggerId) return;
  addLog(
    s,
    canExpand
      ? "Dawn will not come. The house has waited long enough — and turns."
      : "The house is whole now: every door drawn, every room found. Something vast turns over in answer.",
    "haunt",
  );
  triggerHaunt(s, triggerId);
}

function advanceTurn(s: GameState): void {
  const order = s.order;
  if (order.length === 0) return;
  const curIdx = s.activePlayerId ? order.indexOf(s.activePlayerId) : -1;
  // Prefer the next living, connected player; if every remaining player is
  // disconnected (but alive), fall back to any living player so the table still
  // advances rather than freezing on an absent player.
  for (const requireConnected of [true, false]) {
    for (let step = 1; step <= order.length; step++) {
      const idx = (curIdx + step) % order.length;
      const candidate = getPlayer(s, order[idx]!);
      if (candidate?.alive && (!requireConnected || candidate.connected)) {
        if (curIdx + step >= order.length) s.turn += 1;
        s.activePlayerId = candidate.id;
        beginTurn(s);
        checkWinNow(s);
        return;
      }
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
      // If the player who left was mid-turn, relinquish it so the table doesn't
      // freeze on an absent player. Route through end-turn so a departing traitor
      // still triggers the monster phase.
      if (
        s.activePlayerId === action.playerId &&
        (s.phase === "explore" || s.phase === "haunt")
      ) {
        handleEndTurn(s, action.playerId);
      }
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
    case "use-item":
      handleUseItem(s, action.playerId, action.cardId);
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
  // If the active player died during their own turn (a lost attack, a fatal room
  // special or a failed event roll), hand the turn off immediately so play never
  // stalls on a corpse and a dead player is never left holding the turn.
  if (s.phase !== "ended" && s.activePlayerId) {
    const active = getPlayer(s, s.activePlayerId);
    if (active && !active.alive) advanceTurn(s);
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
  /** One-shot consumables in the player's inventory they can spend now. */
  usableItems: CardId[];
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
    usableItems: [],
    canEndTurn: false,
  };
  const p = getPlayer(s, playerId);
  if (!p || !isActiveTurn(s, playerId) || !p.position) return empty;
  // A player who died mid-turn is briefly still active until the turn hands off;
  // the only thing they can still do is end the turn. Offer exactly that, so the
  // legalMoves contract agrees with the reducer (which accepts their end-turn).
  if (!p.alive) return { ...empty, canEndTurn: true };

  const moving = s.movementLeft > 0;
  const explored = moving ? connections(s, p.position) : [];
  // Only advertise a doorway if the room deck can actually yield a tile for this
  // floor — otherwise exploring it is a silent no-op ("bare, impossible wall").
  const floor = s.house[p.position]?.floor;
  const canExpand = floor != null && hasRoomForFloor(s, floor);
  const doors = moving && canExpand ? openDoors(s, p.position) : [];

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
  const usableItems = p.inventory.filter(
    (id) => getCard(id)?.effect.kind === "consumable",
  );

  return {
    explored,
    doors,
    attackMonsters,
    attackPlayers,
    pickupItems,
    tradePartners,
    usableItems,
    canEndTurn: true,
  };
}
