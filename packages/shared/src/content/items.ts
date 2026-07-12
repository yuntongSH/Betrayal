import type { CardDef } from "../types";

/**
 * Items are kept in your inventory and grant passive benefits — usually a
 * combat bonus (weapons) or a tag the engine checks for (keys, light).
 * All text is original.
 */
export const ITEMS: CardDef[] = [
  {
    id: "it-revolver",
    type: "item",
    name: "Rusted Revolver",
    text: "Four chambers, three bullets, one prayer. +1 die when you attack.",
    effect: { kind: "item-passive", tag: "weapon", bonus: 1 },
  },
  {
    id: "it-dagger",
    type: "item",
    name: "Sacrificial Dagger",
    text: "Older than the house. It hums when blood is near. +1 die when you attack.",
    effect: { kind: "item-passive", tag: "weapon", bonus: 1 },
  },
  {
    id: "it-beartrap",
    type: "item",
    name: "Bear Trap",
    text: "Heavy, rusted, and very much still working. +1 die when you attack.",
    effect: { kind: "item-passive", tag: "weapon", bonus: 1 },
  },
  {
    id: "it-lantern",
    type: "item",
    name: "Oil Lantern",
    text: "A small, stubborn circle of light against a very large dark.",
    effect: { kind: "item-passive", tag: "light" },
  },
  {
    id: "it-key",
    type: "item",
    name: "Iron Key",
    text: "Cold and far too heavy for its size. It fits something important.",
    effect: { kind: "item-passive", tag: "key" },
  },
  {
    id: "it-spiritboard",
    type: "item",
    name: "Spirit Board",
    text: "The planchette never quite stops moving. +1 Knowledge while carried.",
    // +1 Knowledge flows through effectiveTrait into mental combat; it carried an
    // "occult" tag too, which double-counted the same +1 in spectral fights.
    effect: { kind: "item-passive", trait: "knowledge", bonus: 1 },
  },
  {
    id: "it-crucifix",
    type: "item",
    name: "Tarnished Crucifix",
    text: "Faith you don't have, in a shape you trust anyway. +1 Sanity while carried.",
    // +1 Sanity flows through effectiveTrait into mental defense; it carried a
    // "holy" tag too, which double-counted the same +1 in spectral fights.
    effect: { kind: "item-passive", trait: "sanity", bonus: 1 },
  },
  {
    id: "it-adrenaline",
    type: "item",
    name: "Adrenaline Syringe",
    text: "One good sprint left in it. +1 Speed while carried.",
    effect: { kind: "item-passive", trait: "speed", bonus: 1 },
  },
  {
    id: "it-salts",
    type: "item",
    name: "Smelling Salts",
    text: "Sharp enough to drag you back from the edge. +1 Sanity while carried.",
    effect: { kind: "item-passive", trait: "sanity", bonus: 1 },
  },
  {
    id: "it-armor",
    type: "item",
    name: "Suit of Armor Plate",
    text: "Dented, ancient, and reassuringly solid. +1 die when you defend.",
    effect: { kind: "item-passive", tag: "armor", bonus: 1 },
  },
  {
    id: "it-coin",
    type: "item",
    name: "Lucky Coin",
    text: "It has come up heads every time for a hundred years. So far.",
    effect: { kind: "item-passive", tag: "trinket" },
  },
  {
    id: "it-rope",
    type: "item",
    name: "Coil of Rope",
    text: "Long, strong, and only a little frayed. Good for climbing. Or worse.",
    effect: { kind: "item-passive", tag: "tool" },
  },
  // --- Consumables: one-shot, actively spent on your turn ---
  {
    id: "it-tonic",
    type: "item",
    name: "Calming Tonic",
    text: "Bitter and blue. Drink it and the whispers recede... for a while. Use: +2 Sanity.",
    effect: { kind: "consumable", use: { kind: "heal", trait: "sanity", delta: 2 } },
  },
  {
    id: "it-stim",
    type: "item",
    name: "Battlefield Stim",
    text: "A soldier's last resort in a cracked glass vial. Use: +2 Might.",
    effect: { kind: "consumable", use: { kind: "heal", trait: "might", delta: 2 } },
  },
  {
    id: "it-elixir",
    type: "item",
    name: "Quicksilver Elixir",
    text: "It tastes of lightning and bad ideas. Use: +2 Speed.",
    effect: { kind: "consumable", use: { kind: "heal", trait: "speed", delta: 2 } },
  },
];
