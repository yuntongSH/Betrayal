/**
 * The complete shared vocabulary of Dread Hollow.
 *
 * Everything here is plain data so the same structures can travel from the
 * engine, across the WebSocket, into the React/three.js client unchanged.
 */

export type PlayerId = string;
export type CharacterId = string;
export type RoomId = string;
export type CardId = string;
export type HauntId = string;

// ---------------------------------------------------------------------------
// Core enumerations
// ---------------------------------------------------------------------------

export type Trait = "speed" | "might" | "sanity" | "knowledge";
export const TRAITS: readonly Trait[] = ["speed", "might", "sanity", "knowledge"];

/** Physical traits roll against the body; mental traits roll against the mind. */
export const PHYSICAL_TRAITS: readonly Trait[] = ["speed", "might"];
export const MENTAL_TRAITS: readonly Trait[] = ["sanity", "knowledge"];

export type Floor = "basement" | "ground" | "upper";
export const FLOORS: readonly Floor[] = ["basement", "ground", "upper"];

export type Direction = "north" | "east" | "south" | "west";
export const DIRECTIONS: readonly Direction[] = ["north", "east", "south", "west"];

export type CardType = "event" | "item" | "omen";

export type Phase = "lobby" | "explore" | "haunt" | "ended";

export type Side = "heroes" | "traitor";

/** Difficulty scales the monsters of the haunt (Standard is the tuned baseline). */
export type Difficulty = "relaxed" | "standard" | "nightmare";
export const DIFFICULTIES: readonly Difficulty[] = ["relaxed", "standard", "nightmare"];
/** Multiplier applied to monster Might & HP when the house turns. */
export const DIFFICULTY_FACTOR: Record<Difficulty, number> = {
  relaxed: 0.7,
  standard: 1,
  nightmare: 1.35,
};

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export interface TraitTrackDef {
  /** Ordered low → high. Index 0 is the lethal "skull" space. */
  values: number[];
  /** Starting index into `values`. */
  start: number;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  age: number;
  /** Short evocative descriptor, e.g. "the disgraced surgeon". */
  title: string;
  /** Hex color used to tint the in-world token and the player's UI. */
  color: string;
  traits: Record<Trait, TraitTrackDef>;
  flavor: string;
}

// ---------------------------------------------------------------------------
// Rooms / the house
// ---------------------------------------------------------------------------

export type RoomSpecial =
  | "none"
  | "entrance-hall"
  | "foyer"
  | "grand-staircase"
  | "stairs-up"
  | "stairs-down"
  | "mystic-elevator"
  | "heal-might"
  | "heal-sanity"
  | "drain-speed"
  | "pit"
  | "draw-extra-omen"
  | "vault";

export interface RoomDef {
  id: RoomId;
  name: string;
  /** Floors this tile may legally be placed on. */
  floors: Floor[];
  /** Doors in tile-local space, before rotation. */
  doorways: Direction[];
  /** Card draws triggered the first time the tile is entered. */
  symbols: CardType[];
  special: RoomSpecial;
  flavor: string;
  /** Standing dice modifier applied to an occupant's rolls (+ blessed / − cursed). */
  aura?: number;
  /** Start tiles are pre-placed and never enter the draw deck. */
  start?: boolean;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface PlacedRoom {
  /** `${floor}:${x}:${y}` — unique location key. */
  key: string;
  roomId: RoomId;
  floor: Floor;
  x: number;
  y: number;
  rotation: Rotation;
  exploredBy: PlayerId | null;
  /** Set once a player has rummaged this room — it can only be searched once. */
  searched?: boolean;
}

// ---------------------------------------------------------------------------
// Cards & effects
// ---------------------------------------------------------------------------

/** Machine-readable card effect resolved by the engine. */
export type CardEffect =
  | { kind: "narrative" }
  | { kind: "trait-mod"; trait: Trait; delta: number }
  | { kind: "heal"; trait: Trait; delta: number }
  | {
      kind: "trait-roll";
      trait: Trait;
      difficulty: number;
      onPass: CardEffect;
      onFail: CardEffect;
    }
  | { kind: "draw"; deck: CardType; count: number }
  | { kind: "item-passive"; trait?: Trait; bonus?: number; tag?: string }
  /** A one-shot item the holder actively spends; `use` is applied then discarded. */
  | { kind: "consumable"; use: CardEffect }
  | { kind: "omen" };

export interface CardDef {
  id: CardId;
  type: CardType;
  name: string;
  text: string;
  effect: CardEffect;
}

// ---------------------------------------------------------------------------
// Haunts
// ---------------------------------------------------------------------------

export interface MonsterState {
  id: string;
  name: string;
  position: string | null; // PlacedRoom.key
  might: number;
  hp: number;
  /** Whether this creature assaults the body (Might) or the mind (Sanity).
   *  Absent is treated as physical. */
  attackType?: "physical" | "mental";
  /** Rooms it advances per monster phase. Absent is treated as 1. */
  speed?: number;
  /** If true, it reforms (back to maxHp at the haunt's start room) when slain. */
  respawns?: boolean;
  /** Starting hp, used to restore a respawning monster. */
  maxHp?: number;
}

export interface HauntState {
  id: HauntId;
  name: string;
  traitorIds: PlayerId[];
  startedById: PlayerId;
  startRoomKey: string | null;
  monsters: MonsterState[];
  heroGoal: string;
  traitorGoal: string;
  /** Per-haunt scratch variables (objective progress, flags, counters). */
  vars: Record<string, number | boolean | string>;
}

// ---------------------------------------------------------------------------
// Players & runtime state
// ---------------------------------------------------------------------------

export interface PlayerState {
  id: PlayerId;
  name: string;
  characterId: CharacterId | null;
  /** Current index into each trait track. */
  traitIndex: Record<Trait, number>;
  position: string | null; // PlacedRoom.key
  inventory: CardId[];
  alive: boolean;
  side: Side | null; // assigned when the haunt begins
  connected: boolean;
  isHost: boolean;
  /** A computer-controlled player whose turns are driven automatically. */
  isBot: boolean;
}

export type LogKind =
  | "info"
  | "move"
  | "card"
  | "roll"
  | "haunt"
  | "combat"
  | "death"
  | "win";

export interface LogEntry {
  id: number;
  turn: number;
  text: string;
  kind: LogKind;
  /** Optional dice payload so the client can animate a roll. */
  dice?: number[];
}

export interface Decks {
  event: CardId[];
  item: CardId[];
  omen: CardId[];
  rooms: RoomId[];
}

export interface GameState {
  id: string;
  phase: Phase;
  seed: number;
  rngState: number;
  /** Round counter (increments when turn returns to the first player). */
  turn: number;
  /** Chosen in the lobby; scales the haunt's monsters. Absent = standard. */
  difficulty?: Difficulty;
  players: PlayerState[];
  /** Turn order (player ids). */
  order: PlayerId[];
  activePlayerId: PlayerId | null;
  /** Movement budget remaining: Speed minus net distance walked from the turn's
   *  start, minus non-refundable steps (explores + deliberate actions). Walking
   *  back toward where you began refunds, so only net progress costs Speed. */
  movementLeft: number;
  /** Room the active player's turn began in (the anchor for net-distance moves). */
  turnStartKey?: string | null;
  /** Non-refundable steps spent this turn: each explore and deliberate action. */
  turnSpent?: number;
  /** Rooms discovered this turn — free to walk back through (already paid for). */
  turnExplored?: string[];
  /** Attacks the active player may still make this turn (one per turn). */
  attacksLeft: number;
  /** PlacedRoom keyed by location. */
  house: Record<string, PlacedRoom>;
  /** Items left on the floor of a room (e.g. dropped by the dead), keyed by room. */
  itemPiles: Record<string, CardId[]>;
  /** Wedged-shut doorways: "keyA|keyB" (sorted) -> the turn the barricade fails. */
  barricades?: Record<string, number>;
  decks: Decks;
  discards: { event: CardId[]; item: CardId[]; omen: CardId[] };
  /** Omens drawn so far — the haunt roll compares against this. */
  omenCount: number;
  haunt: HauntState | null;
  log: LogEntry[];
  nextLogId: number;
  winner: Side | null;
}
