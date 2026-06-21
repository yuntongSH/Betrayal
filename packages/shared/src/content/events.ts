import type { CardDef } from "../types";

/**
 * Event cards resolve immediately when drawn, then go to the discard pile.
 * Many ask for a trait roll and branch on the result. All text is original.
 */
export const EVENTS: CardDef[] = [
  {
    id: "ev-whispers",
    type: "event",
    name: "Whispers in the Walls",
    text: "Voices say your name from inside the plaster. Roll Sanity (4) or lose your grip.",
    effect: {
      kind: "trait-roll",
      trait: "sanity",
      difficulty: 4,
      onPass: { kind: "narrative" },
      onFail: { kind: "trait-mod", trait: "sanity", delta: -1 },
    },
  },
  {
    id: "ev-floorboards",
    type: "event",
    name: "Rotten Floorboards",
    text: "The floor gives way. Roll Speed (3) to catch yourself.",
    effect: {
      kind: "trait-roll",
      trait: "speed",
      difficulty: 3,
      onPass: { kind: "narrative" },
      onFail: { kind: "trait-mod", trait: "might", delta: -1 },
    },
  },
  {
    id: "ev-clarity",
    type: "event",
    name: "A Moment of Clarity",
    text: "For one breath, the house makes terrible sense. Gain 1 Knowledge.",
    effect: { kind: "heal", trait: "knowledge", delta: 1 },
  },
  {
    id: "ev-coldspot",
    type: "event",
    name: "Cold Spot",
    text: "Something walks through you. Lose 1 Sanity.",
    effect: { kind: "trait-mod", trait: "sanity", delta: -1 },
  },
  {
    id: "ev-compartment",
    type: "event",
    name: "Hidden Compartment",
    text: "A panel slides aside. Draw an Item.",
    effect: { kind: "draw", deck: "item", count: 1 },
  },
  {
    id: "ev-secondwind",
    type: "event",
    name: "Second Wind",
    text: "Fear sharpens you instead of breaking you. Gain 1 Speed.",
    effect: { kind: "heal", trait: "speed", delta: 1 },
  },
  {
    id: "ev-dread",
    type: "event",
    name: "Creeping Dread",
    text: "The certainty that you are not alone. Roll Sanity (5).",
    effect: {
      kind: "trait-roll",
      trait: "sanity",
      difficulty: 5,
      onPass: { kind: "narrative" },
      onFail: { kind: "trait-mod", trait: "sanity", delta: -2 },
    },
  },
  {
    id: "ev-grip",
    type: "event",
    name: "Something Grabs You",
    text: "Cold fingers close on your ankle. Roll Might (4) to break free.",
    effect: {
      kind: "trait-roll",
      trait: "might",
      difficulty: 4,
      onPass: { kind: "narrative" },
      onFail: { kind: "trait-mod", trait: "speed", delta: -1 },
    },
  },
  {
    id: "ev-mirror",
    type: "event",
    name: "The Mirror Lies",
    text: "Your reflection moves a half-second late. Roll Knowledge (4).",
    effect: {
      kind: "trait-roll",
      trait: "knowledge",
      difficulty: 4,
      onPass: { kind: "heal", trait: "knowledge", delta: 1 },
      onFail: { kind: "trait-mod", trait: "sanity", delta: -1 },
    },
  },
  {
    id: "ev-tonic",
    type: "event",
    name: "Forgotten Medicine",
    text: "A dusty vial, still potent. Gain 1 Might.",
    effect: { kind: "heal", trait: "might", delta: 1 },
  },
  {
    id: "ev-prayer",
    type: "event",
    name: "Half-Remembered Prayer",
    text: "The words come back when you need them. Gain 1 Sanity.",
    effect: { kind: "heal", trait: "sanity", delta: 1 },
  },
  {
    id: "ev-luckyfind",
    type: "event",
    name: "Lucky Find",
    text: "Tucked behind a loose brick. Draw an Item.",
    effect: { kind: "draw", deck: "item", count: 1 },
  },
];
