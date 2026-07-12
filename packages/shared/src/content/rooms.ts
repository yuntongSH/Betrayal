import type { Floor, RoomDef } from "../types";

/**
 * The manor's rooms. `start` tiles are pre-placed; the rest form the shuffled
 * room deck and are drawn as players push through unexplored doorways.
 *
 * Every room must declare at least one doorway so it can connect back to the
 * tile it was entered from. All names and flavor are original to this project.
 *
 * The deck's *shape* mirrors the official board game's 3rd-edition tile
 * composition (42 drawable tiles; per-floor availability ≈ 23 ground / 22
 * upper / 19 basement; symbol mix ≈ 15 event / 14 omen / 6 item / 7 blank),
 * with a deliberately door-richer distribution so every floor can build out
 * into a full board. See docs/MAP-GAP-ANALYSIS.md for the sourced numbers and
 * the invariants enforced by rooms-composition.test.ts.
 */

const ALL: Floor[] = ["basement", "ground", "upper"];

export const ROOMS: RoomDef[] = [
  // --- Starting tiles (pre-placed, central stair hub) ---
  {
    id: "entrance-hall",
    name: "Entrance Hall",
    floors: ["ground"],
    // Three doorways (the boarded front door doesn't count) — the board game's
    // entrance fans out sideways too, so the ground floor can grow from the start.
    doorways: ["north", "east", "west"],
    special: "entrance-hall",
    start: true,
    flavor: "The door slams shut behind you. Of course it does.",
  },
  {
    id: "foyer",
    name: "Foyer",
    floors: ["ground"],
    doorways: ["north", "south", "east", "west"],
    special: "foyer",
    start: true,
    flavor: "A grand room gone to mildew. Four ways onward, none inviting.",
  },
  {
    id: "grand-staircase",
    name: "Grand Staircase",
    floors: ["ground"],
    doorways: ["south"],
    special: "grand-staircase",
    start: true,
    flavor: "Stairs climb into the dark above and descend into worse below.",
  },
  {
    id: "upper-landing",
    name: "Upper Landing",
    floors: ["upper"],
    // Four-door hub, like the board game's landings — each floor starts with
    // the same fan-out so it can grow in every direction.
    doorways: ["north", "south", "east", "west"],
    special: "stairs-down",
    start: true,
    flavor: "The boards up here remember every footstep ever taken on them.",
  },
  {
    id: "basement-landing",
    name: "Basement Landing",
    floors: ["basement"],
    doorways: ["north", "south", "east", "west"],
    special: "stairs-up",
    start: true,
    flavor: "The air is wet and tastes of old pennies.",
  },

  // --- Drawable rooms ---
  {
    id: "dusty-hallway",
    name: "Dusty Hallway",
    floors: ALL,
    doorways: ["north", "south"],
    special: "none",
    flavor: "Your footprints are the only ones in decades of dust. You hope.",
  },
  {
    id: "creaking-corridor",
    name: "Creaking Corridor",
    floors: ALL,
    doorways: ["north", "east", "south", "west"],
    special: "none",
    flavor: "Something creaks. Then stops, as if listening for you.",
  },
  {
    id: "portrait-gallery",
    name: "Portrait Gallery",
    floors: ["ground", "upper"],
    doorways: ["north", "south", "east"],
    symbol: "event",
    special: "none",
    flavor: "The eyes follow you. You tell yourself it's just good painting.",
  },
  {
    id: "abandoned-nursery",
    name: "Abandoned Nursery",
    floors: ["upper"],
    doorways: ["south", "west"],
    symbol: "omen",
    special: "none",
    flavor: "A music box turns by itself, one note at a time.",
  },
  {
    id: "servants-quarters",
    name: "Servants' Quarters",
    floors: ["ground", "upper"],
    doorways: ["north", "east"],
    symbol: "item",
    special: "none",
    flavor: "Cots still made. Whoever left did so in a hurry.",
  },
  {
    id: "larder",
    name: "Larder",
    floors: ["ground", "basement"],
    doorways: ["north", "west"],
    symbol: "event",
    special: "none",
    flavor: "Jars of something dark. The labels have all peeled away.",
  },
  {
    id: "cold-cellar",
    name: "Cold Cellar",
    floors: ["basement"],
    doorways: ["north", "east", "south"],
    symbol: "item",
    special: "none",
    flavor: "Your breath fogs. It is colder here than outside ever was.",
  },
  {
    id: "boiler-room",
    name: "Boiler Room",
    floors: ["basement"],
    doorways: ["north", "west"],
    symbol: "event",
    special: "drain-speed",
    flavor: "The boiler is stone cold, yet the pipes still groan and knock.",
  },
  {
    id: "catacomb",
    name: "Catacomb",
    floors: ["basement"],
    doorways: ["north", "east", "south", "west"],
    symbol: "omen",
    special: "none",
    flavor: "Niches in the wall, each the size of a person. Most are occupied.",
  },
  {
    id: "chapel",
    name: "Chapel",
    floors: ["ground", "upper"],
    doorways: ["north", "south"],
    symbol: "omen",
    special: "heal-sanity",
    aura: 1,
    flavor: "A small altar. Whatever was worshipped here, it wasn't merciful.",
  },
  {
    id: "conservatory",
    name: "Conservatory",
    floors: ["ground"],
    doorways: ["north", "east", "west"],
    symbol: "event",
    special: "none",
    flavor: "Dead plants, every one of them turned to face the same window.",
  },
  {
    id: "study",
    name: "Study",
    floors: ["ground", "upper"],
    doorways: ["south", "east"],
    symbol: "item",
    special: "none",
    flavor: "An open journal, the last entry a single word repeated to the margin.",
  },
  {
    id: "master-bedroom",
    name: "Master Bedroom",
    floors: ["upper"],
    doorways: ["north", "south", "west"],
    symbol: "omen",
    special: "none",
    flavor: "The bed is unmade and still warm. You are quite alone.",
  },
  {
    id: "attic",
    name: "Attic",
    floors: ["upper"],
    doorways: ["south"],
    symbol: "omen",
    special: "pit",
    flavor: "Rafters vanish into black. Something up there shifts its weight.",
  },
  {
    id: "kitchen",
    name: "Kitchen",
    floors: ["ground", "basement"],
    doorways: ["north", "east", "south"],
    symbol: "event",
    special: "heal-might",
    flavor: "Knives hang in a neat row. One is missing.",
  },
  {
    id: "dining-room",
    name: "Dining Room",
    floors: ["ground"],
    doorways: ["north", "east", "south", "west"],
    symbol: "event",
    special: "none",
    flavor: "The table is set for far more guests than ever arrived.",
  },
  {
    id: "library",
    name: "Library",
    floors: ["ground", "upper"],
    doorways: ["north", "south", "east"],
    symbol: "item",
    special: "none",
    flavor: "Ten thousand books, and every one of them about this house.",
  },
  {
    id: "crypt",
    name: "Crypt",
    floors: ["basement"],
    doorways: ["north", "south"],
    symbol: "omen",
    special: "none",
    aura: -1,
    flavor: "A single sarcophagus, lid slid just slightly ajar.",
  },
  {
    id: "mystic-elevator",
    name: "Caged Lift",
    floors: ALL,
    doorways: ["north", "east", "south", "west"],
    special: "mystic-elevator",
    flavor: "A cage of black iron. The dial spins on its own.",
  },
  {
    id: "gymnasium",
    name: "Gymnasium",
    floors: ["ground", "upper"],
    doorways: ["north", "west"],
    symbol: "event",
    special: "heal-might",
    flavor: "Rotting exercise equipment, and chalk handprints far too high up.",
  },
  {
    id: "vault",
    name: "Vault",
    floors: ALL,
    doorways: ["north"],
    symbol: "item",
    special: "vault",
    flavor: "A great steel door, shut tight. It wants a key. It wants more.",
  },
  {
    // Display name kept original ("Pentagram Chamber" is the official game's
    // coinage); the id stays for save/decor compatibility.
    id: "pentagram-chamber",
    name: "Sigil Chamber",
    floors: ["basement"],
    doorways: ["north", "east", "south", "west"],
    symbol: "omen",
    special: "draw-extra-omen",
    aura: -1,
    flavor: "The figure on the floor is painted in something that isn't paint.",
  },

  // --- Expansion wave: brings the deck to the official 42-tile shape ---
  // (per-floor availability, symbol mix and door spread — see
  // docs/MAP-GAP-ANALYSIS.md). New ids render with generic decor until
  // composers are added in packages/decor.

  // Ground + upper
  {
    id: "solarium",
    name: "Solarium",
    floors: ["ground", "upper"],
    doorways: ["north", "east", "south", "west"],
    symbol: "event",
    special: "none",
    aura: 1,
    flavor: "Glass panes climb to a bright ceiling. The light comes in wrong: noon-warm at midnight.",
  },
  {
    id: "music-room",
    name: "Music Room",
    floors: ["ground", "upper"],
    doorways: ["north", "south", "east"],
    symbol: "omen",
    special: "none",
    flavor: "A harp with snapped strings. Something still practises scales on what's left.",
  },
  {
    id: "trophy-hall",
    name: "Trophy Hall",
    floors: ["ground", "upper"],
    doorways: ["north", "east", "south", "west"],
    symbol: "item",
    special: "none",
    flavor: "A hundred glass eyes, and every mounted head turned toward the door you came in by.",
  },
  {
    id: "sewing-room",
    name: "Sewing Room",
    floors: ["ground", "upper"],
    doorways: ["north", "west"],
    symbol: "event",
    special: "none",
    flavor: "A dress waits on the form, half-finished, sized for no human frame.",
  },

  // Upper + basement (attic-or-cellar rooms — the official deck keeps a whole
  // band of these so both outer floors can grow)
  {
    id: "old-surgery",
    name: "Old Surgery",
    floors: ["upper", "basement"],
    doorways: ["south", "east"],
    symbol: "omen",
    special: "none",
    flavor: "A tilting table, leather straps, a drain in the floor. All of it recently cleaned.",
  },
  {
    id: "harmonium-room",
    name: "Harmonium Room",
    floors: ["upper", "basement"],
    doorways: ["north", "south"],
    symbol: "event",
    special: "none",
    flavor: "The harmonium's bellows rise and fall on their own, gathering breath for something.",
  },
  {
    id: "cage-room",
    name: "Cage Room",
    floors: ["upper", "basement"],
    doorways: ["north", "east"],
    symbol: "omen",
    special: "none",
    flavor: "An iron cage, man-high, bolted to the joists. The lock is on the inside.",
  },
  {
    id: "rafter-crawl",
    name: "Rafter Crawl",
    floors: ["upper", "basement"],
    doorways: ["north", "south"],
    symbol: "event",
    special: "none",
    flavor: "You go bent double through the bones of the house. They creak to fit you.",
  },
  {
    id: "servants-passage",
    name: "Servants' Passage",
    floors: ["upper", "basement"],
    doorways: ["north", "east", "south", "west"],
    special: "none",
    flavor: "A bare corridor behind the walls, worn smooth by feet nobody ever saw.",
  },
  {
    id: "dumbwaiter-shaft",
    name: "Dumbwaiter Shaft",
    floors: ["upper", "basement"],
    doorways: ["north"],
    special: "none",
    flavor: "A hand-cranked box on old ropes. Somewhere along the shaft, a bell answers.",
  },

  // Ground only
  {
    id: "ruined-ballroom",
    name: "Ruined Ballroom",
    floors: ["ground"],
    doorways: ["north", "east", "south", "west"],
    symbol: "event",
    special: "none",
    flavor: "The parquet is scuffed in wide, patient circles. The last dance never quite ended.",
  },
  {
    id: "morning-room",
    name: "Morning Room",
    floors: ["ground"],
    doorways: ["south", "east"],
    symbol: "event",
    special: "none",
    flavor: "Laid out for breakfast and pleasant talk. The teacups are still warm.",
  },
  {
    id: "gun-room",
    name: "Gun Room",
    floors: ["ground"],
    doorways: ["north", "west"],
    symbol: "item",
    special: "none",
    flavor: "Racks for twelve. Eleven stand empty. The twelfth holds something older than guns.",
  },
  {
    id: "verandah",
    name: "Verandah",
    floors: ["ground"],
    doorways: ["north", "east", "west"],
    symbol: "event",
    special: "none",
    flavor: "A roofed porch pressed flat against the night. The garden looks back in.",
  },
  {
    id: "cloakroom",
    name: "Cloakroom",
    floors: ["ground"],
    doorways: ["north"],
    special: "none",
    flavor: "Coats for every guest the house ever welcomed. None were ever reclaimed.",
  },

  // Upper only
  {
    id: "cupola",
    name: "Cupola",
    floors: ["upper"],
    doorways: ["south"],
    symbol: "omen",
    special: "none",
    flavor: "A glass crown above the roofline. The hills run to the horizon, and nothing out there shows a light.",
  },

  // Basement only
  {
    id: "cistern-walk",
    name: "Cistern Walk",
    floors: ["basement"],
    doorways: ["north", "east", "south", "west"],
    symbol: "event",
    special: "none",
    flavor: "A stone walkway rings black water. Ripples spread from the middle, never the edges.",
  },
  {
    id: "coal-bunker",
    name: "Coal Bunker",
    floors: ["basement"],
    doorways: ["east"],
    special: "none",
    flavor: "A hill of old coal, and small bare footprints climbing it.",
  },
  {
    id: "well-room",
    name: "Well Room",
    floors: ["basement"],
    doorways: ["north", "south"],
    symbol: "omen",
    special: "none",
    aura: -1,
    flavor: "The winch rope is new. Whatever needs hauling up still gets hauled up.",
  },
  {
    id: "sump-passage",
    name: "Sump Passage",
    floors: ["basement"],
    doorways: ["north", "east", "south"],
    special: "none",
    flavor: "Ankle-deep water the colour of tea, moving somewhere with intent.",
  },
];

export const ROOMS_BY_ID: Record<string, RoomDef> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
);

export const START_ROOMS = ROOMS.filter((r) => r.start);
export const DRAWABLE_ROOMS = ROOMS.filter((r) => !r.start);
