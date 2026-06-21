import type { CardId, CardType, Decks, Floor, GameState, RoomId } from "./types";
import { Rng } from "./rng";
import { EVENTS, ITEMS, OMENS, DRAWABLE_ROOMS, ROOMS_BY_ID } from "./content";

/** Build freshly-shuffled decks from the content set. */
export function buildDecks(rng: Rng): Decks {
  return {
    event: rng.shuffle(EVENTS.map((c) => c.id)),
    item: rng.shuffle(ITEMS.map((c) => c.id)),
    omen: rng.shuffle(OMENS.map((c) => c.id)),
    rooms: rng.shuffle(DRAWABLE_ROOMS.map((r) => r.id)),
  };
}

/**
 * Draw the top card of a deck. If empty, reshuffle that deck's discard pile
 * using the game's RNG state (so it stays deterministic). Omen decks are never
 * reshuffled — once the omens run out, no more haunts can be triggered by them.
 */
export function drawCard(s: GameState, type: CardType): CardId | null {
  const deck = s.decks[type];
  if (deck.length === 0) {
    const discard = s.discards[type];
    if (discard.length === 0 || type === "omen") return null;
    const rng = Rng.fromState(s.rngState);
    s.decks[type] = rng.shuffle(discard);
    s.discards[type] = [];
    s.rngState = rng.state;
  }
  return s.decks[type].shift() ?? null;
}

/**
 * Draw a room legal for the given floor. Rooms that aren't legal for this floor
 * are rotated to the bottom of the deck so they can appear on a valid floor
 * later. Returns null if the room deck is exhausted.
 */
export function drawRoomForFloor(s: GameState, floor: Floor): RoomId | null {
  const deck = s.decks.rooms;
  const attempts = deck.length;
  for (let i = 0; i < attempts; i++) {
    const id = deck.shift();
    if (!id) break;
    const room = ROOMS_BY_ID[id];
    if (room && room.floors.includes(floor)) return id;
    deck.push(id);
  }
  return null;
}
