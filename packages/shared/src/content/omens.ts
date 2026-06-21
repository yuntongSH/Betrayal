import type { CardDef } from "../types";

/**
 * Omens are kept like items, but drawing one triggers a haunt roll — and the
 * more omens are in play, the likelier the house is to turn. Several omens also
 * act as useful items. All text is original.
 */
export const OMENS: CardDef[] = [
  {
    id: "om-skull",
    type: "omen",
    name: "The Whispering Skull",
    text: "It tells you secrets. Most of them are true. That's the problem.",
    effect: { kind: "omen" },
  },
  {
    id: "om-locket",
    type: "omen",
    name: "Bloodstained Locket",
    text: "A portrait inside of someone who looks exactly like you.",
    effect: { kind: "omen" },
  },
  {
    id: "om-journal",
    type: "omen",
    name: "Madman's Journal",
    text: "The later pages are written in a hand that grows less and less human.",
    effect: { kind: "omen" },
  },
  {
    id: "om-cat",
    type: "omen",
    name: "The Black Cat",
    text: "It has decided to follow you. You are not sure this is luck.",
    effect: { kind: "omen" },
  },
  {
    id: "om-candle",
    type: "omen",
    name: "Ritual Candle",
    text: "It burns with a flame that casts shadows in the wrong direction.",
    effect: { kind: "omen" },
  },
  {
    id: "om-hand",
    type: "omen",
    name: "Severed Hand",
    text: "Still warm. Still, very occasionally, twitching.",
    effect: { kind: "omen" },
  },
  {
    id: "om-mask",
    type: "omen",
    name: "Funeral Mask",
    text: "When you hold it up, you can see who in the room is already dead.",
    effect: { kind: "omen" },
  },
  {
    id: "om-music",
    type: "omen",
    name: "The Music Box",
    text: "It plays a lullaby you have never heard but somehow always known.",
    effect: { kind: "omen" },
  },
];
