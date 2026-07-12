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
  Trait,
} from "./types";
import { Rng } from "./rng";
import { CHARACTERS_BY_ID, ROOMS_BY_ID, getCard } from "./content";
import { TRAITS } from "./types";
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
import { barricadeId, connections, isBarricaded, netWalkDistance, openDoors, placedDoorways } from "./house";
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

/** The active player's full Speed budget for the turn (effective, ≥1). */
function speedBudget(p: PlayerState): number {
  return Math.max(1, effectiveTrait(p, "speed"));
}

/**
 * Recompute the movement left for the active player: their Speed, minus the
 * non-refundable steps spent this turn (explores + deliberate actions), minus
 * the *net* walking distance from where the turn began. Backtracking shrinks
 * that net distance, so it refunds movement — only net progress costs Speed.
 */
function recomputeMovement(s: GameState): void {
  const active = getPlayer(s, s.activePlayerId);
  if (!active?.position || s.turnStartKey == null) return;
  const free = new Set(s.turnExplored ?? []);
  const net = netWalkDistance(s, s.turnStartKey, active.position, free);
  const reach = Number.isFinite(net) ? net : speedBudget(active);
  s.movementLeft = Math.max(0, speedBudget(active) - (s.turnSpent ?? 0) - reach);
}

/**
 * Board rule: "Whenever a game effect makes you draw a card, you must STOP
 * moving for the rest of your turn." Halt the active explorer's movement — bank
 * Speed-worth of spent steps (the same trick `rest` uses) so no later recompute
 * (e.g. a +Speed consumable) can refund it, then zero what's left. Non-movement
 * actions (attack, use-item) are unaffected; further explore / move /
 * investigate are blocked, since they all gate on `movementLeft`.
 */
function haltMovement(s: GameState, p: PlayerState): void {
  if (p.id !== s.activePlayerId) return;
  s.turnSpent = (s.turnSpent ?? 0) + speedBudget(p) + 1;
  s.movementLeft = 0;
}

/** Can the active player afford to stand in `toKey`? (Backtracking is cheap.) */
function canReach(s: GameState, p: PlayerState, toKey: string): boolean {
  if (s.turnStartKey == null) return s.movementLeft > 0;
  const free = new Set(s.turnExplored ?? []);
  const net = netWalkDistance(s, s.turnStartKey, toKey, free);
  return Number.isFinite(net) && (s.turnSpent ?? 0) + net <= speedBudget(p);
}

function handleMoveTo(s: GameState, playerId: PlayerId, toKey: string): void {
  const p = getPlayer(s, playerId);
  if (!p?.alive || !isActiveTurn(s, playerId)) return;
  if (!p.position) return;
  if (!connections(s, p.position).includes(toKey)) return;
  // Budgeted by net distance from the turn's start, not raw step count — so
  // stepping back toward where you began is free even with no movement "left".
  if (!canReach(s, p, toKey)) return;

  p.position = toKey;
  recomputeMovement(s);
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
  // Discovering a new room is one non-refundable step (you can't game Speed by
  // exploring, walking back to your start, and exploring again). The new room
  // is then free to walk back through this turn — you already paid to make it.
  s.turnSpent = (s.turnSpent ?? 0) + 1;
  (s.turnExplored ??= []).push(nKey);
  recomputeMovement(s);
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
        "The iron cage shudders. Its dial spins. It will carry you between floors.",
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
  if (!def?.symbol) return;
  if (s.phase !== "explore" && s.phase !== "haunt") return;
  drawAndResolve(s, p, def.symbol);
  // Discovering a room with a card symbol draws a card, which ends the active
  // explorer's move for the turn (board rule). You can't walk on — most rooms
  // have a symbol, so a turn is usually a single discovery; symbol-less rooms
  // (corridors, landings) don't stop you.
  haltMovement(s, p);
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
    addLog(s, `${p.name} triggers an Event · ${card.name}: ${card.text}`, "card");
    applyEffect(s, p, card.effect);
    s.discards.event.push(cardId);
  } else if (card.type === "item") {
    addLog(s, `${p.name} picks up an Item: ${card.name}.`, "card");
    p.inventory.push(cardId);
  } else {
    addLog(s, `${p.name} uncovers an Omen: ${card.name}.`, "card");
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
      modTrait(s, p, effect.trait, effect.delta);
      // A mid-turn Speed change must re-extend THIS turn's movement budget — it
      // is otherwise only set at beginTurn — so a "+2 Speed" consumable
      // (Quicksilver Elixir) actually lets you move farther on the turn you drink
      // it. Recompute against the new Speed (net-distance model handles the rest).
      if (effect.trait === "speed" && p.alive && p.id === s.activePlayerId) {
        recomputeMovement(s);
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
        `${p.name} rolls ${effect.trait} · ${roll.total} vs ${effect.difficulty}: ${passed ? "success" : "failure"}.`,
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
    addLog(s, "The last omen falls into place. The house can hold back no longer.", "haunt");
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
// Deliberate turn actions: rest · barricade · investigate
// ---------------------------------------------------------------------------
// (There is deliberately NO "search the room" action: in the board game, cards
// come ONLY from discovering a new symbol tile — a rummage-for-loot action
// existed here once and was removed for rules fidelity.)

/** Rounds a wedged-shut doorway holds before it gives way. */
const BARRICADE_ROUNDS = 3;

/** Forfeit the rest of your movement to steady your most-wounded trait. */
function handleRest(s: GameState, playerId: PlayerId): void {
  const p = getPlayer(s, playerId);
  if (!p?.alive || !isActiveTurn(s, playerId) || s.movementLeft <= 0) return;
  const ch = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
  if (!ch) return;
  let worst: (typeof TRAITS)[number] | null = null;
  let worstIdx = Infinity;
  for (const t of TRAITS) {
    const idx = p.traitIndex[t];
    if (idx < ch.traits[t].values.length - 1 && idx < worstIdx) {
      worstIdx = idx;
      worst = t;
    }
  }
  if (!worst) return; // every trait already topped out — nothing to recover
  // Resting takes the rest of your turn: bank Speed-worth of spent steps so no
  // recompute (e.g. a later Speed change) can hand the movement back.
  s.turnSpent = (s.turnSpent ?? 0) + speedBudget(p) + 1;
  s.movementLeft = 0;
  modTrait(s, p, worst, 1);
  addLog(s, `${p.name} stops to breathe, steadying their ${worst}.`, "card");
  checkWinNow(s);
}

/** Wedge a doorway shut so nothing follows through it for a few rounds. */
function handleBarricade(s: GameState, playerId: PlayerId, door: Direction): void {
  const p = getPlayer(s, playerId);
  if (!p?.alive || !isActiveTurn(s, playerId) || !p.position || s.movementLeft <= 0) return;
  const room = s.house[p.position];
  if (!room) return;
  const nKey = neighborKey(room.floor, room.x, room.y, door);
  // Must be a real, currently-open passage to a placed room.
  if (!s.house[nKey] || isBarricaded(s, p.position, nKey) || !connections(s, p.position).includes(nKey)) return;
  s.turnSpent = (s.turnSpent ?? 0) + 1; // a deliberate action: non-refundable
  (s.barricades ??= {})[barricadeId(p.position, nKey)] = s.turn + BARRICADE_ROUNDS;
  recomputeMovement(s);
  const nName = ROOMS_BY_ID[s.house[nKey]!.roomId]?.name ?? "the next room";
  addLog(s, `${p.name} wedges the door to the ${nName} shut.`, "info");
  checkWinNow(s);
}

/** Study your surroundings (Knowledge check) to learn something hidden. */
function handleInvestigate(s: GameState, playerId: PlayerId): void {
  const p = getPlayer(s, playerId);
  if (!p?.alive || !isActiveTurn(s, playerId) || s.movementLeft <= 0) return;
  s.turnSpent = (s.turnSpent ?? 0) + 1; // a deliberate action: non-refundable
  recomputeMovement(s);
  const rng = Rng.fromState(s.rngState);
  const roll = rollDice(rng, Math.max(1, effectiveTrait(p, "knowledge") + roomAura(s, p)));
  s.rngState = rng.state;
  addLog(s, `${p.name} studies the shadows: Knowledge ${roll.total} vs 4.`, "roll", roll.dice);
  if (roll.total < 4) {
    addLog(s, `${p.name} learns nothing useful.`, "info");
    checkWinNow(s);
    return;
  }
  const monsters = s.haunt?.monsters.filter((m) => m.hp > 0) ?? [];
  if (s.phase === "haunt" && monsters.length) {
    const weakest = monsters.slice().sort((a, b) => a.might - b.might)[0]!;
    addLog(s, `${p.name} reads the ${weakest.name}: it strikes at ${weakest.might}, ${weakest.hp} life left.`, "card");
  } else if (s.decks.omen.length) {
    addLog(s, `${p.name} senses the omen drawing near: ${getCard(s.decks.omen[0]!)?.name ?? "something dark"}.`, "card");
  } else {
    addLog(s, `${p.name} feels the house has little left to hide.`, "info");
  }
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
      ? "Dawn will not come. The house has waited long enough... and turns."
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
    case "set-difficulty": {
      const host = getPlayer(s, action.playerId);
      if (host?.isHost && s.phase === "lobby") s.difficulty = action.difficulty;
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
    case "rest":
      handleRest(s, action.playerId);
      break;
    case "barricade":
      handleBarricade(s, action.playerId, action.door);
      break;
    case "investigate":
      handleInvestigate(s, action.playerId);
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
  /** A wounded trait can be steadied by resting (forfeits movement). */
  canRest: boolean;
  /** Doorways to a connected room that can be wedged shut. */
  barricadeDoors: Direction[];
  /** A Knowledge check to learn something hidden is available. */
  canInvestigate: boolean;
  canEndTurn: boolean;
  /** Advisory for the UI: strictly NOTHING remains this turn but ending it —
   *  no move (not even a free backtrack), door, attack, pickup, usable item,
   *  possible trade, rest, barricade or investigate. */
  nothingLeft: boolean;
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
    canRest: false,
    barricadeDoors: [],
    canInvestigate: false,
    canEndTurn: false,
    nothingLeft: false,
  };
  const p = getPlayer(s, playerId);
  if (!p || !isActiveTurn(s, playerId) || !p.position) return empty;
  // A player who died mid-turn is briefly still active until the turn hands off;
  // the only thing they can still do is end the turn. Offer exactly that, so the
  // legalMoves contract agrees with the reducer (which accepts their end-turn).
  if (!p.alive) return { ...empty, canEndTurn: true, nothingLeft: true };

  const moving = s.movementLeft > 0;
  // Walking is budgeted by net distance from the turn's start, so a step back
  // toward where you began is always affordable — even with no movement left.
  // Advertise every connected room you can still afford to stand in.
  const explored = connections(s, p.position).filter((k) => canReach(s, p, k));
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

  // Deliberate turn actions (all spend movement, so they trade off against it).
  const room = s.house[p.position];
  const ch = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
  const canRest =
    moving && !!ch && TRAITS.some((t: Trait) => p.traitIndex[t] < ch.traits[t].values.length - 1);
  const barricadeDoors =
    moving && room
      ? [...placedDoorways(room)].filter((dir) => {
          const nKey = neighborKey(room.floor, room.x, room.y, dir);
          return !!s.house[nKey] && !isBarricaded(s, p.position!, nKey) && connections(s, p.position!).includes(nKey);
        })
      : [];
  const canInvestigate = moving;

  // Trading only counts as "something to do" if there's an item to hand over.
  const canTrade = tradePartners.length > 0 && p.inventory.length > 0;
  const nothingLeft =
    explored.length === 0 &&
    doors.length === 0 &&
    attackMonsters.length === 0 &&
    attackPlayers.length === 0 &&
    pickupItems.length === 0 &&
    usableItems.length === 0 &&
    !canTrade &&
    !canRest &&
    barricadeDoors.length === 0 &&
    !canInvestigate;

  return {
    explored,
    doors,
    attackMonsters,
    attackPlayers,
    pickupItems,
    tradePartners,
    usableItems,
    canRest,
    barricadeDoors,
    canInvestigate,
    canEndTurn: true,
    nothingLeft,
  };
}
