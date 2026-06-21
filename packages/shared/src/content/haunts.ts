import type {
  GameState,
  HauntId,
  MonsterState,
  PlayerId,
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

let monsterSeq = 0;
function spawn(
  s: GameState,
  ctx: HauntContext,
  name: string,
  might: number,
  hp: number,
  count: number,
): void {
  if (!s.haunt) return;
  const keys = ctx.roomKeys();
  for (let i = 0; i < count; i++) {
    const pos = keys.length ? ctx.rng.pick(keys) : ctx.spawnKey();
    s.haunt.monsters.push({
      id: `m${monsterSeq++}`,
      name,
      position: pos,
      might,
      hp,
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
      spawn(s, ctx, "Shade", 3, 3, heroes);
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
      spawn(s, ctx, "Acolyte", 2, 2, 1);
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
    },
    checkWin: (s) => {
      if (livingHeroes(s).length === 0) return "traitor";
      // Destroying the house's maws breaks the spell on the doors...
      if (livingMonsters(s).length === 0) return "heroes";
      // ...or a hero forces the front door with the Iron Key. (Heroes begin in
      // the Entrance Hall, so the key requirement prevents an instant escape.)
      const escaped = livingHeroes(s).some((p) => {
        const room = p.position ? s.house[p.position] : undefined;
        return room?.roomId === "entrance-hall" && p.inventory.includes("it-key");
      });
      return escaped ? "heroes" : null;
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
      spawn(s, ctx, "The Drowned", 6, 8, 1);
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
];

export const HAUNTS_BY_ID: Record<string, HauntDef> = Object.fromEntries(
  HAUNTS.map((h) => [h.id, h]),
);
