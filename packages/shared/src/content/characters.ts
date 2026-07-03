import type { CharacterDef, Trait, TraitTrackDef } from "../types";

/**
 * Six original explorers. Each has four trait tracks of eight spaces, low → high.
 * Index 0 is the lethal "skull" space; `start` is where the character begins.
 *
 * Beyond the card-front stats, each explorer carries a dossier (bio, birthday,
 * hobbies, fear, keepsake), a BOND tying them to one other explorer — the six
 * bonds form a single closed circle, so no one walked in here a stranger — and
 * in-voice LINES the engine speaks at the night's hinge moments (arrival, the
 * haunt reveal from either side, death, victory).
 *
 * All names, dates, titles and flavor are original to this project.
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
    birthday: "the 3rd of March",
    hobbies: ["anatomical sketching", "chess problems", "picking old locks"],
    fear: "her hands going still",
    keepsake: "a physician's bag the board never reclaimed",
    bio:
      "Four minutes dead on her table, and the patient sat up and thanked her by name — the board called it desecration and took her license, but not her notes. She has spent six years asking what came back in those four minutes. The manor, they say, has been answering questions like hers for a century.",
    bond: {
      with: "crow",
      text:
        "When a carnival cannon crushed Silas Crow's right hand, she rebuilt it off the books, knuckle by knuckle. He has never asked what she charged; she has never asked what he heard in the smoke.",
    },
    lines: {
      arrival: "If the dead here don't stay buried, someone ought to take proper notes.",
      hauntHero: "Symptoms first, panic later. Tell me exactly what you saw.",
      hauntTraitor:
        "You call it betrayal. I call it the procedure this house has been begging for.",
      death: "Interesting… so that's what it's like from the table.",
      victory: "Stitch it closed. Whatever this house had, it's in remission.",
    },
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
    birthday: "the 19th of August",
    hobbies: ["palming cards", "mending broken things", "cooking for a crowd"],
    fear: "the smell of burning canvas",
    keepsake: "the iron bar he bent the night of the fire",
    bio:
      "The night the big top burned he held a falling beam off fourteen people until his hands cooked, and every one of them walked out. What he never tells the papers: something else walked out of that smoke with them, and it has said his name in every quiet room since. He came to the manor to make it stop saying it.",
    bond: {
      with: "penny",
      text:
        "Penny Ashgrove stowed away with his carnival for a whole season. He taught her to palm cards, fed her from his own plate, and told the ringmaster nothing.",
    },
    lines: {
      arrival: "Big doors, small hinges. Nothing in here heavier than what I've carried.",
      hauntHero: "Get behind me. All of you. That's not a request.",
      hauntTraitor:
        "I held a burning roof off you people once. I've been wondering ever since why I bothered.",
      death: "Went down holding the roof… that's fine. That's how it was always going to go.",
      victory: "Show's over, folks. Walk out slow, and don't look back at the tent.",
    },
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
    birthday: "the 31st of October",
    hobbies: ["taking dares", "collecting other people's keys", "climbing where she shouldn't"],
    fear: "being sent back",
    keepsake: "Mister Buttons, a one-eyed sewn rabbit",
    bio:
      "She has run away from the county home three times, and the third time she made it a whole season without being caught. The dare was only to touch the manor's gate — but the front door stood open, and something upstairs said her name the way you'd say it if you were glad she came. Nobody has ever said it like that before.",
    bond: {
      with: "tobias",
      text:
        "Brother Tobias found her asleep in the abbey woodshed one January and fed her for nine days without one question. She still keeps the key he never asked her to return.",
    },
    lines: {
      arrival: "I've run away from worse houses than this one.",
      hauntHero: "I'm not scared. Mister Buttons is scared. I'm just holding him.",
      hauntTraitor: "The house asked nicer than anybody ever asked me. So I said yes.",
      death: "Mister Buttons… you can be the brave one now.",
      victory: "Told you. Eleven's not too little for anything.",
    },
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
    birthday: "the 21st of December",
    hobbies: ["illuminating manuscripts", "keeping bees", "walking at night"],
    fear: "that no one has ever been listening",
    keepsake: "a brass storm-lantern from the abbey crypt",
    bio:
      "Forty years a copyist, and not one prayer answered — until the voice in the abbey crypt recited his doubts back to him, word for word, in his own hand's rhythm. The abbot called it acoustics. Tobias stopped praying that night and started looking, and the manor is the last name on his list of places where something might actually answer.",
    bond: {
      with: "odette",
      text:
        "It was Tobias who wrote to Odette Lindqvist about the crypt — a monk asking a medium for help, a letter that could have cost him his order. When the voice greeted her by name, he pretended not to see her shaking.",
    },
    lines: {
      arrival: "If Heaven is silent, perhaps everything worth hearing is in here.",
      hauntHero: "Forty years of doubt, and the argument finally comes to me. Stand together.",
      hauntTraitor:
        "I asked for one answer in forty years. The house answered. Forgive me for listening.",
      death: "Oh… it was listening. All this time, it was—",
      victory: "Something heard us tonight. For once I am content not to know what.",
    },
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
    birthday: "the 14th of February",
    hobbies: ["reading strangers cold", "writing letters to the dead", "pressing grave-flowers"],
    fear: "a summoned voice that refuses to leave",
    keepsake: "her mother's silver pendulum locket",
    bio:
      "Her mother's act was clean, profitable fraud — until the night a real voice cut into the patter, and the act became a haunting with matinees. Odette inherited the locket, the trade, and the visitor. For the past year the manor has been writing to her: unsigned letters, in her own handwriting, describing rooms she has never seen. Tonight she intends to compare them against the originals.",
    bond: {
      with: "thorne",
      text:
        "Marcus Thorne sat in on one of her séances meaning to expose her. His photograph showed seven figures around her six-chair table, and he has never printed it — but she knows what his camera saw, because the seventh wrote to her about him.",
    },
    lines: {
      arrival: "The house is very loud tonight. Try not to answer it, any of you.",
      hauntHero: "Whatever speaks next, let me answer it. I know the etiquette of the dead.",
      hauntTraitor:
        "For a year it wrote to me in my own hand. Tonight I'm only signing what was already true.",
      death: "Mother… move over.",
      victory: "Hush now. The line is closed, and nobody is to reopen it.",
    },
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
    birthday: "the 6th of June",
    hobbies: ["darkroom work", "watching birds through a long lens", "annotating other men's memoirs"],
    fear: "what's on the one roll he never developed",
    keepsake: "a dented box camera on a leather strap",
    bio:
      "Three wars, two shrapnel scars, one roll of film he will not develop. In his negatives from a burned village, the same face watches from a different window in every frame — a face he has since found in older photographs, from older wars, always at a window. The last window he traced it to belongs to this manor. He brought the camera. He wants it to pose.",
    bond: {
      with: "vance",
      text:
        "A field surgeon rebuilt his shattered leg in a tent that was on fire at the time; he walked out owing Dr. Vance a debt neither of them has ever mentioned. He recognized her at the gate. She nodded like it was a waiting room.",
    },
    lines: {
      arrival: "Every awful place I've been let me photograph it. Let's see if this one poses.",
      hauntHero: "Eyes open. The worst thing in any war is the one you didn't see coming.",
      hauntTraitor:
        "Twenty years behind the camera. Tonight I'd rather be in the shot.",
      death: "Develop the roll… it was always going to be this house.",
      victory: "One more war nobody will believe. Good thing I brought the proof.",
    },
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
