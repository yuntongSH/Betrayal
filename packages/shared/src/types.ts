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
  players: PlayerState[];
  /** Turn order (player ids). */
  order: PlayerId[];
  activePlayerId: PlayerId | null;
  movementLeft: number;
  /** PlacedRoom keyed by location. */
  house: Record<string, PlacedRoom>;
  decks: Decks;
  discards: { event: CardId[]; item: CardId[]; omen: CardId[] };
  /** Omens drawn so far — the haunt roll compares against this. */
  omenCount: number;
  haunt: HauntState | null;
  log: LogEntry[];
  nextLogId: number;
  winner: Side | null;
}
