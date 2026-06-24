import type { CardId, CharacterId, Direction, PlayerId } from "./types";

/**
 * Player intents. The authoritative engine validates every one of these against
 * the current game state before applying it — clients can ask, but never tell.
 */
export type Action =
  | { type: "join"; playerId: PlayerId; name: string; isBot?: boolean }
  | { type: "leave"; playerId: PlayerId }
  | { type: "choose-character"; playerId: PlayerId; characterId: CharacterId }
  /** Host adds a computer-controlled player. */
  | { type: "add-bot"; playerId: PlayerId }
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
  /** Pick up an item lying on the floor of your current room. */
  | { type: "pickup-item"; playerId: PlayerId; cardId: CardId }
  /** Hand one of your items to another explorer sharing your room. */
  | { type: "give-item"; playerId: PlayerId; toPlayerId: PlayerId; cardId: CardId }
  | { type: "end-turn"; playerId: PlayerId };

export type ActionType = Action["type"];
