import type { CharacterId, Direction, PlayerId } from "./types";

/**
 * Player intents. The authoritative engine validates every one of these against
 * the current game state before applying it — clients can ask, but never tell.
 */
export type Action =
  | { type: "join"; playerId: PlayerId; name: string }
  | { type: "leave"; playerId: PlayerId }
  | { type: "choose-character"; playerId: PlayerId; characterId: CharacterId }
  | { type: "start-game"; playerId: PlayerId }
  /** Walk into an already-placed, connected room (or take a stair link). */
  | { type: "move-to"; playerId: PlayerId; toKey: string }
  /** Push through an open doorway into the unknown, drawing & placing a tile. */
  | { type: "explore"; playerId: PlayerId; door: Direction }
  /** Resolve the card currently offered (apply its effect). */
  | { type: "resolve-card"; playerId: PlayerId }
  /** During a haunt: attack a monster or another player in your room. */
  | {
      type: "attack";
      playerId: PlayerId;
      targetMonsterId?: string;
      targetPlayerId?: PlayerId;
    }
  | { type: "end-turn"; playerId: PlayerId };

export type ActionType = Action["type"];
