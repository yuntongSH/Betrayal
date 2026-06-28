import type {
  GameState,
  HauntId,
  MonsterState,
  PlayerId,
  PlayerState,
  Side,
} from "../types";
import type { Rng } from "../rng";

/**
 * A haunt scenario. When the house turns, the engine builds a `HauntState`
 * shell, copies the goals across, then calls `setup` to spawn monsters and seed
 * objective variables. `checkWin` is consulted after every action.
 *
 * Haunt defs depend only on `types` + `Rng` (never the engine itself) so there
 * is no import cycle. All scenarios, names and flavor are original.
 */
export interface HauntContext {
  rng: Rng;
  /** All currently-placed room keys. */
  roomKeys: () => string[];
  /** Best spawn location: the room the haunt began in, else a random room. */
  spawnKey: () => string | null;
}

export interface HauntDef {
  id: HauntId;
  name: string;
  reveal: string;
  heroGoal: string;
  traitorGoal: string;
  /** Pick the traitor(s); defaults to the triggering player. */
  chooseTraitors?: (state: GameState, triggerId: PlayerId) => PlayerId[];
  setup: (state: GameState, traitorIds: PlayerId[], ctx: HauntContext) => void;
  /** Winning side, or null while the haunt continues. */
  checkWin: (state: GameState) => Side | null;
}

// --- shared helpers -------------------------------------------------------

function livingHeroes(s: GameState) {
  return s.players.filter((p) => p.side === "heroes" && p.alive);
}
function livingTraitors(s: GameState) {
  return s.players.filter((p) => p.side === "traitor" && p.alive);
}
function livingMonsters(s: GameState): MonsterState[] {
  return s.haunt ? s.haunt.monsters.filter((m) => m.hp > 0) : [];
}

/**
 * Objective-haunt wins (reach a Chapel, carry the Key to the Entrance) must be
 * EARNED during the haunt — not handed out because a hero happened to be standing
 * in the right place when the house turned (everyone starts in the Entrance Hall,
 * so the key-at-entrance win was otherwise instant). At reveal we snapshot the
 * heroes who already qualify and exclude them until they qualify afresh. Stored
 * as a "|"-joined id string because HauntState.vars holds only scalars.
 */
function markEscapeSnapshot(
  s: GameState,
  key: string,
  qualifies: (p: PlayerState) => boolean,
): void {
  if (!s.haunt) return;
  s.haunt.vars[key] = livingHeroes(s).filter(qualifies).map((p) => p.id).join("|");
}
function escapedDuringHaunt(
  s: GameState,
  key: string,
  qualifies: (p: PlayerState) => boolean,
): boolean {
  if (!s.haunt) return false;
  const snap = new Set(
    String(s.haunt.vars[key] ?? "").split("|").filter(Boolean),
  );
  // Prune any snapshotted hero who no longer qualifies (left the room / dropped
  // the key). checkWin runs after every action, so once such a hero walks away
  // they leave the snapshot — and a genuine RETURN during the haunt then counts,
  // while a hero who never left still can't claim the win that was true at reveal.
  const qualifyingNow = new Set(livingHeroes(s).filter(qualifies).map((p) => p.id));
  for (const id of [...snap]) if (!qualifyingNow.has(id)) snap.delete(id);
  s.haunt.vars[key] = [...snap].join("|");
  return livingHeroes(s).some((p) => !snap.has(p.id) && qualifies(p));
}
const inRoomWithKey = (s: GameState) => (p: PlayerState) =>
  (p.position ? s.house[p.position]?.roomId : undefined) === "entrance-hall" &&
  p.inventory.includes("it-key");
const inChapel = (s: GameState) => (p: PlayerState) =>
  (p.position ? s.house[p.position]?.roomId : undefined) === "chapel";

let monsterSeq = 0;
interface SpawnOpts {
  attackType?: "physical" | "mental";
  /** Rooms moved per monster phase (default 1). */
  speed?: number;
  /** Reforms at the haunt's start room when slain. */
  respawns?: boolean;
  /** Where to place them: spread at random, or clustered at the start room. */
  at?: "random" | "start";
}
function spawn(
  s: GameState,
  ctx: HauntContext,
  name: string,
  might: number,
  hp: number,
  count: number,
  opts: SpawnOpts = {},
): void {
  if (!s.haunt) return;
  const { attackType = "physical", speed = 1, respawns = false, at = "random" } = opts;
  const keys = ctx.roomKeys();
  for (let i = 0; i < count; i++) {
    const pos =
      at === "start" ? ctx.spawnKey() : keys.length ? ctx.rng.pick(keys) : ctx.spawnKey();
    s.haunt.monsters.push({
      id: `m${monsterSeq++}`,
      name,
      position: pos,
      might,
      hp,
      maxHp: hp,
      attackType,
      speed,
      respawns,
    });
  }
}

/** The classic terminal conditions most haunts share. */
function baseOutcome(s: GameState): Side | null {
  if (livingHeroes(s).length === 0) return "traitor";
  if (livingTraitors(s).length === 0) return "heroes";
  return null;
}

// --- the scenarios --------------------------------------------------------

export const HAUNTS: HauntDef[] = [
  {
    id: "crawling-dark",
    name: "The Crawling Dark",
    reveal:
      "The lanterns gutter out one by one. Where {traitor} stands, the shadow on the wall keeps moving after they stop — and then it peels away from the wall entirely.",
    heroGoal:
      "Destroy the traitor before the shades drag every last one of you into the dark.",
    traitorGoal: "Snuff out every hero.",
    setup: (s, _t, ctx) => {
      const heroes = Math.max(1, livingHeroes(s).length);
      // Spectral, quick, and they reform from the dark — the heroes must reach
      // the traitor, not waste the night cutting down shades that won't stay dead.
      spawn(s, ctx, "Shade", 3, 3, heroes, {
        attackType: "mental",
        speed: 2,
        respawns: true,
        at: "start",
      });
    },
    checkWin: (s) => baseOutcome(s),
  },
  {
    id: "blood-moon",
    name: "Blood Moon Ritual",
    reveal:
      "{traitor} draws a circle in chalk and salt and worse, and begins to chant. Outside, impossibly, the moon turns the color of an old wound.",
    heroGoal: "Kill the traitor before the ritual is completed.",
    traitorGoal:
      "Complete the ritual — survive four of your own turns — or kill all heroes.",
    setup: (s, _t, ctx) => {
      if (!s.haunt) return;
      s.haunt.vars.ritualProgress = 0;
      s.haunt.vars.ritualNeeded = 4;
      spawn(s, ctx, "Acolyte", 2, 2, 1, { at: "start" });
    },
    checkWin: (s) => {
      if (!s.haunt) return null;
      const progress = Number(s.haunt.vars.ritualProgress ?? 0);
      const needed = Number(s.haunt.vars.ritualNeeded ?? 4);
      if (progress >= needed) return "traitor";
      return baseOutcome(s);
    },
  },
  {
    id: "hungering-house",
    name: "The Hungering House",
    reveal:
      "The walls flex like a throat. {traitor} smiles — they understand now that the house was never a building. It was always a mouth, and they are its tongue.",
    heroGoal:
      "Destroy the house's maws, or carry the Iron Key to the Entrance Hall and force the door open.",
    traitorGoal: "Devour every hero before they break free.",
    setup: (s, _t, ctx) => {
      spawn(s, ctx, "Gnashing Maw", 4, 4, 2);
      markEscapeSnapshot(s, "keyEscape", inRoomWithKey(s));
    },
    checkWin: (s) => {
      if (livingHeroes(s).length === 0) return "traitor";
      // Destroying the house's maws breaks the spell on the doors...
      if (livingMonsters(s).length === 0) return "heroes";
      // ...or a hero carries the Iron Key to the front door DURING the haunt
      // (heroes who already stood there with the key at reveal don't count).
      return escapedDuringHaunt(s, "keyEscape", inRoomWithKey(s)) ? "heroes" : null;
    },
  },
  {
    id: "wake-of-the-drowned",
    name: "Wake of the Drowned",
    reveal:
      "Water seeps up between every floorboard, black and cold and rising. Something vast turns over beneath the house, and {traitor} wades toward it, unafraid, called home.",
    heroGoal: "Survive five full rounds, or destroy the Drowned.",
    traitorGoal: "Drown every hero.",
    setup: (s, _t, ctx) => {
      if (!s.haunt) return;
      s.haunt.vars.surviveUntilTurn = s.turn + 5;
      // Vast and slow, but it does not stop coming. Bare noun — the log templates
      // already supply the article ("The Drowned", "the Drowned").
      spawn(s, ctx, "Drowned", 6, 8, 1, { speed: 1, at: "start" });
    },
    checkWin: (s) => {
      if (!s.haunt) return null;
      if (livingMonsters(s).length === 0) return "heroes";
      if (s.turn >= Number(s.haunt.vars.surviveUntilTurn ?? Infinity))
        return "heroes";
      if (livingHeroes(s).length === 0) return "traitor";
      return null;
    },
  },
  {
    id: "the-hunt",
    name: "The Hunt",
    reveal:
      "{traitor}'s spine arches the wrong way. Teeth crowd a mouth that is suddenly too wide. The thing that was your friend drops to all fours, and grins, and the chase begins.",
    heroGoal:
      "Reach consecrated ground — get a living hero into a Chapel — or put the beast down.",
    traitorGoal: "Run down every last one of them.",
    setup: (s) => {
      // No summoned monsters — the traitor *is* the monster.
      if (s.haunt) s.haunt.vars.theHunt = true;
      markEscapeSnapshot(s, "chapelEscape", inChapel(s));
    },
    checkWin: (s) => {
      if (livingHeroes(s).length === 0) return "traitor";
      if (livingTraitors(s).length === 0) return "heroes";
      // A hero must REACH consecrated ground during the hunt — sheltering in a
      // chapel before the chase began doesn't count.
      return escapedDuringHaunt(s, "chapelEscape", inChapel(s)) ? "heroes" : null;
    },
  },
  {
    id: "plague-of-whispers",
    name: "Plague of Whispers",
    reveal:
      "{traitor} opens their mouth and no voice comes out — instead the room fills with whispering, dozens of small pale shapes unfolding from the corners where the candlelight can't quite reach.",
    heroGoal: "Silence every whisper, or destroy the one who set them loose.",
    traitorGoal: "Let the whispers drown the living.",
    setup: (s, _t, ctx) => {
      const heroes = Math.max(1, livingHeroes(s).length);
      // Many, fast, and they go for the mind — but they stay dead once silenced.
      spawn(s, ctx, "Whisper", 2, 2, heroes * 2, { attackType: "mental", speed: 2 });
    },
    checkWin: (s) => {
      if (livingHeroes(s).length === 0) return "traitor";
      if (livingTraitors(s).length === 0) return "heroes";
      if (livingMonsters(s).length === 0) return "heroes";
      return null;
    },
  },
  {
    id: "the-tide",
    name: "The Tide Comes In",
    reveal:
      "Black water climbs the walls of its own accord and the house breathes out a cold with no source. There is no betrayer tonight — the house itself has woken, and it means to keep every one of you.",
    heroGoal:
      "Stand together: destroy every drowned thing, or carry the Iron Key to the Entrance Hall and force the flooded door.",
    // No traitor: an "everyone vs. the house" haunt. The house wins if all drown.
    traitorGoal: "",
    chooseTraitors: () => [],
    setup: (s, _t, ctx) => {
      const heroes = Math.max(1, livingHeroes(s).length);
      spawn(s, ctx, "Drowned Hand", 2, 4, heroes, { attackType: "physical", at: "start" });
      markEscapeSnapshot(s, "keyEscape", inRoomWithKey(s));
    },
    checkWin: (s) => {
      if (livingHeroes(s).length === 0) return "traitor"; // the house prevails
      if (livingMonsters(s).length === 0) return "heroes";
      // Carry the Iron Key to the flooded door during the haunt (standing there
      // with it when the tide came in doesn't count).
      return escapedDuringHaunt(s, "keyEscape", inRoomWithKey(s)) ? "heroes" : null;
    },
  },
];

export const HAUNTS_BY_ID: Record<string, HauntDef> = Object.fromEntries(
  HAUNTS.map((h) => [h.id, h]),
);
