/**
 * Computer-controlled players.
 *
 * `botStep` returns the next single action a bot should take and whether its
 * turn should end afterward — so a server can animate bot turns step-by-step
 * with delays, while tests can run them instantly via `runBotTurn`.
 *
 * Depends on the engine (reduce/legalMoves) but the engine never imports this,
 * so there is no cycle.
 */
import type { Action } from "./actions";
import type { GameState, PlayerId, PlayerState } from "./types";
import { TRAITS } from "./types";
import { legalMoves, reduce } from "./engine";
import { getPlayer } from "./state";
import { openDoors, stepToward } from "./house";
import { neighborKey } from "./grid";
import { hasRoomForFloor } from "./decks";
import { getCard } from "./content";
import { Rng } from "./rng";

/** Lowest trait track index a player sits at — 0 is the skull (death). */
function lowestTraitIndex(p: PlayerState): number {
  return Math.min(...TRAITS.map((t) => p.traitIndex[t] ?? 99));
}

/** Explored rooms that still have a doorway a new room could be drawn through. */
function explorableFrontier(s: GameState): Set<string> {
  const out = new Set<string>();
  for (const r of Object.values(s.house)) {
    if (hasRoomForFloor(s, r.floor) && openDoors(s, r.key).length > 0) out.add(r.key);
  }
  return out;
}

/** Rooms a bot wants to reach in the haunt: enemy explorers, and (for heroes) the
 *  traitor's monsters — so a bot closes in to fight rather than standing idle. */
function foePositions(s: GameState, p: PlayerState): Set<string> {
  const out = new Set<string>();
  for (const o of s.players) {
    if (o.alive && o.position && o.id !== p.id && o.side && p.side && o.side !== p.side) {
      out.add(o.position);
    }
  }
  if (p.side === "heroes") {
    for (const m of s.haunt?.monsters ?? []) if (m.hp > 0 && m.position) out.add(m.position);
  }
  return out;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface BotStep {
  action: Action;
  /** End the bot's turn after applying this action. */
  endTurnAfter: boolean;
}

/**
 * Decide a bot's next move. Strategy: strike anything in the room (then stop),
 * otherwise spend movement exploring (to find loot) or wandering, then end.
 */
export function botStep(s: GameState, pid: PlayerId): BotStep {
  const end: BotStep = { action: { type: "end-turn", playerId: pid }, endTurnAfter: true };
  const p = getPlayer(s, pid);
  if (!p || s.activePlayerId !== pid) return end;

  const legal = legalMoves(s, pid);

  // One attack per turn, then stop — keeps bots from chain-killing.
  if (legal.attackMonsters.length) {
    return { action: { type: "attack", playerId: pid, targetMonsterId: legal.attackMonsters[0] }, endTurnAfter: true };
  }
  if (legal.attackPlayers.length) {
    return { action: { type: "attack", playerId: pid, targetPlayerId: legal.attackPlayers[0] }, endTurnAfter: true };
  }

  // Scoop up anything left on the floor here (e.g. a dead explorer's key).
  if (legal.pickupItems.length) {
    return { action: { type: "pickup-item", playerId: pid, cardId: legal.pickupItems[0]! }, endTurnAfter: false };
  }

  // Self-preservation: if a trait is one or two steps from the skull and a
  // carried consumable heals that trait, drink it before risking the turn (bots
  // used to die holding the very +2 that would have saved them).
  for (const id of legal.usableItems) {
    const eff = getCard(id)?.effect;
    if (eff?.kind === "consumable" && eff.use.kind === "heal" && (p.traitIndex[eff.use.trait] ?? 99) <= 2) {
      return { action: { type: "use-item", playerId: pid, cardId: id }, endTurnAfter: false };
    }
  }

  // Defensive barricade: a hero who's badly hurt walls off a door a monster is
  // about to come through, buying a few rounds rather than trading blows it can't
  // win. Reserved for real danger (one step from the skull) so bots still press
  // the attack when they're healthy. (Past the attack checks: no monster here.)
  if (s.phase === "haunt" && p.side === "heroes" && legal.barricadeDoors.length && lowestTraitIndex(p) <= 1) {
    const room = s.house[p.position!];
    const monsterRooms = new Set(
      (s.haunt?.monsters ?? []).filter((m) => m.hp > 0 && m.position).map((m) => m.position),
    );
    if (room) {
      for (const dir of legal.barricadeDoors) {
        if (monsterRooms.has(neighborKey(room.floor, room.x, room.y, dir))) {
          return { action: { type: "barricade", playerId: pid, door: dir }, endTurnAfter: false };
        }
      }
    }
  }

  // Rest: critically wounded (a trait one step from the skull) with no item left
  // to drink — catch your breath to step back from death. Forfeits the turn.
  if (legal.canRest && lowestTraitIndex(p) <= 1) {
    return { action: { type: "rest", playerId: pid }, endTurnAfter: true };
  }

  if (s.movementLeft > 0) {
    const rng = new Rng((s.rngState ^ Math.imul(s.turn, 0x9e3779b1) ^ hash(pid)) >>> 0);

    // In the haunt, the traitor never sightsees (growing the house is pointless
    // post-betrayal). If there are NO summoned monsters, the traitor IS the
    // threat (e.g. The Hunt) and must run heroes down. Otherwise the monsters do
    // the hunting, so the traitor holds position — which also runs out the clock
    // on "survive N turns" haunts instead of suiciding into the heroes.
    if (s.phase === "haunt" && p.side === "traitor") {
      const hasMonsters = (s.haunt?.monsters ?? []).some((m) => m.hp > 0);
      if (!hasMonsters) {
        const foes = foePositions(s, p);
        foes.delete(p.position!);
        if (foes.size > 0) {
          const step = stepToward(s, p.position!, foes);
          if (step && step !== p.position) {
            return { action: { type: "move-to", playerId: pid, toKey: step }, endTurnAfter: false };
          }
        }
      }
      return end;
    }

    // 1) Discover a new room from here — then yield, so the house grows at a
    //    measured pace and one bot doesn't build out the whole floor in a turn.
    //    (legal.doors is already gated to doors that can actually draw a room.)
    if (legal.doors.length > 0) {
      return { action: { type: "explore", playerId: pid, door: rng.pick(legal.doors) }, endTurnAfter: true };
    }

    // 1b) No new room to find from here, but this room hasn't been rummaged —
    //     occasionally search it for loot before moving on (gears bots up for
    //     the haunt). Kept infrequent so bots don't strip-mine the item deck and
    //     tilt the balance; explore phase only, so haunt bots stay aggressive.
    if (legal.canSearch && s.phase === "explore" && rng.next() < 0.15) {
      return { action: { type: "search", playerId: pid }, endTurnAfter: false };
    }

    // 1c) Occasionally pause to read the omens (a Knowledge check). Pure flavour
    //     for a watching human — and balance-neutral, since a bot can't act on
    //     the info, so generous use here won't skew the game. endTurnAfter false
    //     keeps the turn going (it still has steps to spend).
    if (legal.canInvestigate && rng.next() < 0.12) {
      return { action: { type: "investigate", playerId: pid }, endTurnAfter: false };
    }

    // 2) Nothing to discover here: head TOWARD the nearest room that still can be
    //    explored, instead of pacing back and forth between rooms already seen.
    const frontier = explorableFrontier(s);
    frontier.delete(p.position!);
    if (frontier.size > 0) {
      const step = stepToward(s, p.position!, frontier);
      if (step && step !== p.position) {
        return { action: { type: "move-to", playerId: pid, toKey: step }, endTurnAfter: false };
      }
    }

    // 3) In the haunt, with nothing left to discover, close on the nearest foe so
    //    the betrayal actually plays out rather than everyone standing around.
    if (s.phase === "haunt") {
      const foes = foePositions(s, p);
      foes.delete(p.position!);
      if (foes.size > 0) {
        const step = stepToward(s, p.position!, foes);
        if (step && step !== p.position) {
          return { action: { type: "move-to", playerId: pid, toKey: step }, endTurnAfter: false };
        }
      }
    }
  }
  return end;
}

/** Run a bot's entire turn immediately (tests / serverless instant mode). */
export function runBotTurn(s: GameState, pid: PlayerId, maxSteps = 40): void {
  let steps = 0;
  while (s.phase !== "ended" && s.activePlayerId === pid && steps++ < maxSteps) {
    const { action, endTurnAfter } = botStep(s, pid);
    const beforePos = getPlayer(s, pid)?.position;
    const beforeMove = s.movementLeft;
    const beforeInv = getPlayer(s, pid)?.inventory.length ?? 0;
    reduce(s, action);
    if (endTurnAfter) {
      if (action.type !== "end-turn" && s.activePlayerId === pid) {
        reduce(s, { type: "end-turn", playerId: pid });
      }
      return;
    }
    // Safety: if a step made no progress (no move, no pickup), end the turn
    // rather than spin.
    if (
      getPlayer(s, pid)?.position === beforePos &&
      s.movementLeft === beforeMove &&
      (getPlayer(s, pid)?.inventory.length ?? 0) === beforeInv
    ) {
      reduce(s, { type: "end-turn", playerId: pid });
      return;
    }
  }
  if (s.activePlayerId === pid && s.phase !== "ended") {
    reduce(s, { type: "end-turn", playerId: pid });
  }
}
