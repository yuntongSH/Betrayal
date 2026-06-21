import type { Action, GameState } from "@dread-hollow/shared";

/** Messages the browser sends to the authoritative server. */
export type ClientMessage =
  | { t: "create-room"; name: string; resumePlayerId?: string }
  | { t: "join-room"; code: string; name: string; resumePlayerId?: string }
  | { t: "action"; action: Action }
  | { t: "leave-room" }
  | { t: "ping" };

/** Messages the server pushes back to browsers. */
export type ServerMessage =
  | { t: "joined"; code: string; playerId: string; state: GameState }
  | { t: "state"; state: GameState }
  | { t: "error"; message: string }
  | { t: "pong" };
