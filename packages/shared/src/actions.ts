import type { CardId, CharacterId, Difficulty, Direction, PlayerId } from "./types";

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
  /** Host sets the difficulty (scales the haunt's monsters) before the game starts. */
  | { type: "set-difficulty"; playerId: PlayerId; difficulty: Difficulty }
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
  /** Spend a one-shot consumable from your inventory. */
  | { type: "use-item"; playerId: PlayerId; cardId: CardId }
  /** Pick up an item lying on the floor of your current room. */
  | { type: "pickup-item"; playerId: PlayerId; cardId: CardId }
  /** Hand one of your items to another explorer sharing your room. */
  | { type: "give-item"; playerId: PlayerId; toPlayerId: PlayerId; cardId: CardId }
  /** Rummage the current room (once each) — find an item, or spring an event. */
  | { type: "search"; playerId: PlayerId }
  /** Forfeit the rest of your movement to steady your most-wounded trait. */
  | { type: "rest"; playerId: PlayerId }
  /** Wedge a doorway shut so nothing can follow through it for a few rounds. */
  | { type: "barricade"; playerId: PlayerId; door: Direction }
  /** Study your surroundings (Knowledge check) to learn something hidden. */
  | { type: "investigate"; playerId: PlayerId }
  | { type: "end-turn"; playerId: PlayerId };

export type ActionType = Action["type"];
