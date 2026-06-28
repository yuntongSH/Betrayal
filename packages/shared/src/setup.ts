import type {
  CharacterId,
  GameState,
  PlayerId,
  PlayerState,
  Trait,
} from "./types";
import { TRAITS } from "./types";
import { Rng } from "./rng";
import { buildDecks } from "./decks";
import { CHARACTERS, CHARACTERS_BY_ID, START_ROOMS } from "./content";
import { key } from "./grid";
import { addLog, effectiveTrait, getPlayer } from "./state";

/** Cross-floor stair connections from the central hub (the Grand Staircase). */
export const STAIR_LINKS: ReadonlyArray<readonly [string, string]> = [
  [key("ground", 0, 0), key("upper", 0, 0)],
  [key("ground", 0, 0), key("basement", 0, 0)],
];

/** Where each pre-placed start tile lives, and how it's oriented. */
const START_PLACEMENT: Record<string, { floor: GameState["house"][string]["floor"]; x: number; y: number }> = {
  "grand-staircase": { floor: "ground", x: 0, y: 0 },
  foyer: { floor: "ground", x: 0, y: 1 },
  "entrance-hall": { floor: "ground", x: 0, y: 2 },
  "upper-landing": { floor: "upper", x: 0, y: 0 },
  "basement-landing": { floor: "basement", x: 0, y: 0 },
};

/** Players begin in the Entrance Hall. */
export const ENTRANCE_KEY = key("ground", 0, 2);

export function createGame(id: string, seed: number): GameState {
  return {
    id,
    phase: "lobby",
    seed,
    rngState: seed >>> 0 || 0x12345678,
    turn: 0,
    difficulty: "standard",
    players: [],
    order: [],
    activePlayerId: null,
    movementLeft: 0,
    turnStartKey: null,
    turnSpent: 0,
    turnExplored: [],
    attacksLeft: 0,
    house: {},
    itemPiles: {},
    barricades: {},
    decks: { event: [], item: [], omen: [], rooms: [] },
    discards: { event: [], item: [], omen: [] },
    omenCount: 0,
    haunt: null,
    log: [],
    nextLogId: 1,
    winner: null,
  };
}

function emptyTraitIndex(): Record<Trait, number> {
  return { speed: 0, might: 0, sanity: 0, knowledge: 0 };
}

export function addPlayer(
  s: GameState,
  id: PlayerId,
  name: string,
  isBot = false,
): PlayerState {
  const existing = getPlayer(s, id);
  if (existing) {
    existing.connected = true;
    existing.name = name || existing.name;
    return existing;
  }
  const player: PlayerState = {
    id,
    name: name || "Wanderer",
    characterId: null,
    traitIndex: emptyTraitIndex(),
    position: null,
    inventory: [],
    alive: true,
    side: null,
    connected: true,
    isHost: s.players.length === 0,
    isBot,
  };
  s.players.push(player);
  addLog(s, `${player.name} enters the foyer.`, "info");
  return player;
}

/** Minimum party size; smaller lobbies are topped up with bots on start. */
export const MIN_PLAYERS = 3;

/** Add one computer-controlled player, claiming the first free character. */
export function addBot(s: GameState): PlayerState | null {
  if (s.phase !== "lobby") return null;
  const used = new Set(s.players.map((p) => p.characterId).filter(Boolean));
  const char = CHARACTERS.find((c) => !used.has(c.id));
  if (!char) return null; // every character is taken
  const id = `bot-${char.id}`;
  const bot = addPlayer(s, id, `${char.name.split(" ").pop()} (bot)`, true);
  chooseCharacter(s, id, char.id);
  return bot;
}

/** Top the lobby up with bots until it reaches `target` players. */
export function fillWithBots(s: GameState, target: number): void {
  while (s.players.length < target) {
    if (!addBot(s)) break;
  }
}

export function setConnected(s: GameState, id: PlayerId, connected: boolean): void {
  const p = getPlayer(s, id);
  if (p) p.connected = connected;
}

export function chooseCharacter(
  s: GameState,
  playerId: PlayerId,
  characterId: CharacterId,
): void {
  if (s.phase !== "lobby") return;
  const player = getPlayer(s, playerId);
  if (!player) return;
  const taken = s.players.some(
    (p) => p.id !== playerId && p.characterId === characterId,
  );
  if (taken) return;
  const def = CHARACTERS_BY_ID[characterId];
  if (!def) return;
  player.characterId = characterId;
  for (const trait of TRAITS) {
    player.traitIndex[trait] = def.traits[trait].start;
  }
}

/** Begin the active player's turn: refresh movement from their *effective*
 *  Speed (so Speed-boosting items extend it) and the single attack each turn.
 *  Anchor the turn here so movement is budgeted by net distance from this room. */
export function beginTurn(s: GameState): void {
  const active = getPlayer(s, s.activePlayerId);
  if (!active) return;
  s.turnStartKey = active.position ?? null;
  s.turnSpent = 0;
  s.turnExplored = [];
  s.movementLeft = Math.max(1, effectiveTrait(active, "speed"));
  s.attacksLeft = 1;
}

/**
 * Transition from the lobby into exploration: shuffle turn order, build decks,
 * place the start tiles and drop everyone in the Entrance Hall.
 */
export function startGame(s: GameState): boolean {
  if (s.phase !== "lobby") return false;
  // Top up to a minimum, watchable party with bots (e.g. 2 humans -> +1 bot).
  fillWithBots(s, MIN_PLAYERS);
  const ready = s.players.filter((p) => p.characterId);
  if (ready.length < 1) return false;

  const rng = new Rng(s.rngState);

  // Place the pre-built start tiles.
  for (const room of START_ROOMS) {
    const at = START_PLACEMENT[room.id];
    if (!at) continue;
    const k = key(at.floor, at.x, at.y);
    s.house[k] = {
      key: k,
      roomId: room.id,
      floor: at.floor,
      x: at.x,
      y: at.y,
      rotation: 0,
      exploredBy: null,
    };
  }

  s.decks = buildDecks(rng);
  s.rngState = rng.state;

  // Only players who picked a character take part.
  const order = rng.shuffle(ready.map((p) => p.id));
  s.rngState = rng.state;
  s.order = order;
  s.players = s.players.filter((p) => p.characterId);

  for (const p of s.players) {
    p.position = ENTRANCE_KEY;
  }

  s.activePlayerId = order[0] ?? null;
  s.turn = 1;
  s.phase = "explore";
  beginTurn(s);
  addLog(s, "The front door closes. The house begins to wake.", "info");
  return true;
}
