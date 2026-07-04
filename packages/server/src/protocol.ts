import { z } from "zod";
import type { GameState } from "@dread-hollow/shared";

/**
 * Runtime-validated wire protocol. The server treats anything off the socket as
 * untrusted: it parses every client frame against these schemas, so a malformed
 * or hostile message is rejected at the boundary instead of reaching the engine.
 * The static `ClientMessage` type is *inferred* from the schema, so the runtime
 * check and the compile-time type can never drift apart.
 */
const Direction = z.enum(["north", "east", "south", "west"]);

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), playerId: z.string(), name: z.string(), isBot: z.boolean().optional() }),
  z.object({ type: z.literal("leave"), playerId: z.string() }),
  z.object({ type: z.literal("choose-character"), playerId: z.string(), characterId: z.string() }),
  z.object({ type: z.literal("add-bot"), playerId: z.string() }),
  z.object({
    type: z.literal("set-difficulty"),
    playerId: z.string(),
    difficulty: z.enum(["relaxed", "standard", "nightmare"]),
  }),
  z.object({ type: z.literal("start-game"), playerId: z.string() }),
  z.object({ type: z.literal("move-to"), playerId: z.string(), toKey: z.string() }),
  z.object({ type: z.literal("explore"), playerId: z.string(), door: Direction }),
  z.object({ type: z.literal("resolve-card"), playerId: z.string() }),
  z.object({
    type: z.literal("attack"),
    playerId: z.string(),
    targetMonsterId: z.string().optional(),
    targetPlayerId: z.string().optional(),
  }),
  z.object({ type: z.literal("use-item"), playerId: z.string(), cardId: z.string() }),
  z.object({ type: z.literal("pickup-item"), playerId: z.string(), cardId: z.string() }),
  z.object({
    type: z.literal("give-item"),
    playerId: z.string(),
    toPlayerId: z.string(),
    cardId: z.string(),
  }),
  z.object({ type: z.literal("rest"), playerId: z.string() }),
  z.object({ type: z.literal("barricade"), playerId: z.string(), door: Direction }),
  z.object({ type: z.literal("investigate"), playerId: z.string() }),
  z.object({ type: z.literal("end-turn"), playerId: z.string() }),
]);

export const ClientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("create-room"), name: z.string().max(40), resumePlayerId: z.string().optional(), resumeToken: z.string().optional() }),
  z.object({ t: z.literal("join-room"), code: z.string().max(8), name: z.string().max(40), resumePlayerId: z.string().optional(), resumeToken: z.string().optional() }),
  z.object({ t: z.literal("action"), action: ActionSchema }),
  z.object({ t: z.literal("leave-room") }),
  z.object({ t: z.literal("ping") }),
]);

/** Inferred from the schema — single source of truth for the client contract. */
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientAction = z.infer<typeof ActionSchema>;

/** Server → client messages (authored by the server, no runtime validation). */
export type ServerMessage =
  | { t: "joined"; code: string; playerId: string; resumeToken: string; state: GameState }
  | { t: "state"; state: GameState }
  | { t: "error"; message: string }
  | { t: "pong" };
