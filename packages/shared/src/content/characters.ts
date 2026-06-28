import type { CharacterDef, Trait, TraitTrackDef } from "../types";

/**
 * Six original explorers. Each has four trait tracks of eight spaces, low → high.
 * Index 0 is the lethal "skull" space; `start` is where the character begins.
 *
 * All names, ages, titles and flavor are original to this project.
 */

function track(values: number[], start: number): TraitTrackDef {
  return { values, start };
}

function traits(
  speed: TraitTrackDef,
  might: TraitTrackDef,
  sanity: TraitTrackDef,
  knowledge: TraitTrackDef,
): Record<Trait, TraitTrackDef> {
  return { speed, might, sanity, knowledge };
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "vance",
    name: "Dr. Mireille Vance",
    age: 44,
    title: "the disgraced surgeon",
    color: "#4aa3a2",
    flavor:
      "Struck off for operations no medical board would sanction. She came to the manor chasing a rumor that the dead here do not always stay buried.",
    traits: traits(
      track([0, 2, 3, 3, 4, 5, 5, 6], 3),
      track([0, 2, 2, 3, 4, 4, 5, 6], 3),
      track([0, 3, 4, 5, 6, 6, 7, 8], 4),
      track([0, 4, 5, 5, 6, 7, 7, 8], 5),
    ),
  },
  {
    id: "crow",
    name: "Silas Crow",
    age: 38,
    title: "the carnival strongman",
    color: "#b5563a",
    flavor:
      "Bent iron bars for laughing crowds until the laughter turned to screaming. He doesn't scare easy. He's about to learn what easy means.",
    traits: traits(
      track([0, 3, 4, 4, 5, 6, 6, 7], 4),
      track([0, 4, 5, 6, 6, 7, 8, 8], 4),
      track([0, 2, 3, 3, 4, 4, 5, 6], 3),
      track([0, 2, 2, 3, 3, 4, 5, 5], 2),
    ),
  },
  {
    id: "penny",
    name: "Penny Ashgrove",
    age: 11,
    title: "the runaway child",
    color: "#d8b54a",
    flavor:
      "She slipped through the gate on a dare and found the front door already open. Small, quick, and far braver than is good for her.",
    traits: traits(
      track([0, 4, 5, 6, 6, 7, 8, 8], 5),
      track([0, 1, 2, 2, 3, 3, 4, 5], 2),
      track([0, 3, 4, 5, 5, 6, 7, 8], 4),
      track([0, 2, 3, 4, 5, 5, 6, 7], 3),
    ),
  },
  {
    id: "tobias",
    name: "Brother Tobias",
    age: 57,
    title: "the doubting monk",
    color: "#7a6db0",
    flavor:
      "Forty years of prayer left him certain of nothing but his own unworthiness. If anything in this house has a soul, he intends to find it.",
    traits: traits(
      track([0, 2, 2, 3, 4, 4, 5, 6], 3),
      track([0, 2, 3, 3, 4, 5, 5, 6], 3),
      track([0, 4, 5, 6, 7, 7, 8, 8], 5),
      track([0, 3, 4, 5, 5, 6, 7, 8], 4),
    ),
  },
  {
    id: "odette",
    name: "Odette Lindqvist",
    age: 33,
    title: "the séance medium",
    color: "#c25a8f",
    flavor:
      "Half her clients were frauds and she knew it. The other half were not, and that is what keeps her awake. The manor is very loud tonight.",
    traits: traits(
      track([0, 2, 3, 4, 4, 5, 6, 6], 3),
      track([0, 2, 2, 3, 3, 4, 4, 5], 2),
      track([0, 3, 4, 5, 6, 6, 7, 8], 4),
      track([0, 4, 5, 6, 7, 7, 8, 8], 5),
    ),
  },
  {
    id: "thorne",
    name: "Marcus Thorne",
    age: 41,
    title: "the war photographer",
    color: "#5a8f5a",
    flavor:
      "He has photographed the worst things people do to each other and slept fine after. He brought a camera. He has a feeling he'll need the proof.",
    traits: traits(
      track([0, 3, 4, 4, 5, 5, 6, 7], 4),
      track([0, 3, 3, 4, 4, 5, 6, 6], 3),
      track([0, 3, 4, 4, 5, 6, 6, 7], 4),
      track([0, 3, 4, 4, 5, 6, 6, 7], 4),
    ),
  },
];

export const CHARACTERS_BY_ID: Record<string, CharacterDef> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
);
