import type { CardDef, CardId } from "../types";
import { EVENTS } from "./events";
import { ITEMS } from "./items";
import { OMENS } from "./omens";

export { CHARACTERS, CHARACTERS_BY_ID } from "./characters";
export {
  ROOMS,
  ROOMS_BY_ID,
  START_ROOMS,
  DRAWABLE_ROOMS,
} from "./rooms";
export { EVENTS } from "./events";
export { ITEMS } from "./items";
export { OMENS } from "./omens";
export { HAUNTS, HAUNTS_BY_ID } from "./haunts";
export type { HauntDef, HauntContext } from "./haunts";

/** Every card in the game, regardless of deck. */
export const ALL_CARDS: CardDef[] = [...EVENTS, ...ITEMS, ...OMENS];

export const CARDS_BY_ID: Record<CardId, CardDef> = Object.fromEntries(
  ALL_CARDS.map((c) => [c.id, c]),
);

export function getCard(id: CardId): CardDef | undefined {
  return CARDS_BY_ID[id];
}
