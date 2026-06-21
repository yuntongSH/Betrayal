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
import type { GameState, PlayerId } from "./types";
import { legalMoves, reduce } from "./engine";
import { getPlayer } from "./state";
import { Rng } from "./rng";

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

  // Don't try to explore once the room deck is spent (avoids dead-door spinning).
  const canExplore = s.decks.rooms.length > 0 && legal.doors.length > 0;
  if (s.movementLeft > 0) {
    const rng = new Rng((s.rngState ^ Math.imul(s.turn, 0x9e3779b1) ^ hash(pid)) >>> 0);
    if (canExplore && (legal.explored.length === 0 || rng.next() < 0.6)) {
      return { action: { type: "explore", playerId: pid, door: rng.pick(legal.doors) }, endTurnAfter: false };
    }
    if (legal.explored.length) {
      return { action: { type: "move-to", playerId: pid, toKey: rng.pick(legal.explored) }, endTurnAfter: false };
    }
    if (canExplore) {
      return { action: { type: "explore", playerId: pid, door: rng.pick(legal.doors) }, endTurnAfter: false };
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
    reduce(s, action);
    if (endTurnAfter) {
      if (action.type !== "end-turn" && s.activePlayerId === pid) {
        reduce(s, { type: "end-turn", playerId: pid });
      }
      return;
    }
    // Safety: if a move made no progress, end the turn rather than spin.
    if (getPlayer(s, pid)?.position === beforePos && s.movementLeft === beforeMove) {
      reduce(s, { type: "end-turn", playerId: pid });
      return;
    }
  }
  if (s.activePlayerId === pid && s.phase !== "ended") {
    reduce(s, { type: "end-turn", playerId: pid });
  }
}
