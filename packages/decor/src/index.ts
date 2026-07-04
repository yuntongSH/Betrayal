import * as THREE from "three";
// Per-character explorer builders (each module owns one figure).
import { buildVanceFigure } from "./explorers/vance";
import { buildCrowFigure } from "./explorers/crow";
import { buildPennyFigure } from "./explorers/penny";
import { buildTobiasFigure } from "./explorers/tobias";
import { buildOdetteFigure } from "./explorers/odette";
import { buildThorneFigure } from "./explorers/thorne";
import {
  instanced,
  peelingWallpaper,
  wallCrack,
  stainDecal,
  moldPatch,
  clawMarks,
  cobwebFunnel,
  cobwebStrand,
  scatteredPaper,
  glassShards,
  dustPile,
  rubblePile,
  rats,
  skull,
  bonePile,
  bottlesAndJars,
  chain,
  drippingCandle,
  framedPortrait,
  tornCurtain,
  brokenChair,
  debrisPlank,
  floorPuddle,
} from "./detail";

export * from "./materials";
export { attachKeepsake } from "./props";
export { refineExplorerAvatar, attachAvatarLife, makeStudioEnvTexture } from "./refine";
export type { AvatarLife } from "./refine";
export { createDreadScore, type DreadScore, type DreadScene, type StingKind } from "./audio";

/**
 * @dread-hollow/decor
 *
 * Framework-agnostic three.js builders for themed room decorations and
 * character figures used by Dread Hollow.
 *
 * Coordinate system / conventions:
 *  - A room is a square footprint of side `tile` (default 7), centered at the
 *    origin. The floor's TOP surface is at y = 0; props rest ON the floor
 *    (y >= 0) and may hang from a ceiling at y ~= WALL_H (3.2).
 *  - Props stay within the inner area so they don't poke through walls:
 *    x, z in [-(tile/2 - WALL_MARGIN), +(tile/2 - WALL_MARGIN)].
 *  - The centre carries at most a compact "island" centerpiece (r <= ISLAND_R);
 *    the annulus r 1.2..2.0 stays walkable — player tokens ring up at r ~= 1.6
 *    — and the corridor in front of every (possible) doorway is kept clear.
 *  - Everything is built from three primitives. No external models/textures.
 *  - FRESH materials are created inside every call. Callers dispose materials
 *    when clearing rooms, so module-level shared instances must NOT be used.
 */

export interface RoomTheme {
  floor: number;
  wall: number;
  accent: number;
  accentIntensity: number;
}

/** Ceiling height (top of walls). Props hang at or below this. */
const WALL_H = 3.2;
/** How far props must stay clear of the walls. */
const WALL_MARGIN = 0.4;

// ---------------------------------------------------------------------------
// Theme map
// ---------------------------------------------------------------------------

const DEFAULT_THEME: RoomTheme = {
  floor: 0x3a3330,
  wall: 0x4a4440,
  accent: 0xb8a070,
  accentIntensity: 0.6,
};

/**
 * Per-room palette. Returns sensible floor/wall colors and an accent (used for
 * glows, candle light, magic decals, etc). Unknown ids get a tasteful default.
 */
export function roomTheme(roomId: string): RoomTheme {
  const themes: Record<string, RoomTheme> = {
    // Cold / blue
    chapel: { floor: 0x2b3140, wall: 0x39455c, accent: 0x6fa8ff, accentIntensity: 0.9 },
    "mystic-elevator": { floor: 0x2a2e3a, wall: 0x394050, accent: 0x77b6ff, accentIntensity: 0.85 },
    "upper-landing": { floor: 0x393640, wall: 0x474350, accent: 0x8fb0d8, accentIntensity: 0.5 },

    // Warm / hearth
    kitchen: { floor: 0x4a3a2c, wall: 0x5a4636, accent: 0xffb24d, accentIntensity: 0.9 },
    "dining-room": { floor: 0x402e22, wall: 0x523c2c, accent: 0xffc266, accentIntensity: 0.8 },
    larder: { floor: 0x463528, wall: 0x564233, accent: 0xe0a85a, accentIntensity: 0.6 },

    // Blood red
    "pentagram-chamber": { floor: 0x2a1414, wall: 0x3a1c1c, accent: 0xff2a2a, accentIntensity: 1.0 },
    crypt: { floor: 0x262022, wall: 0x342a2c, accent: 0xc12a2a, accentIntensity: 0.7 },
    catacomb: { floor: 0x241e1e, wall: 0x322828, accent: 0xb83030, accentIntensity: 0.7 },

    // Sickly green
    conservatory: { floor: 0x2c382a, wall: 0x3a4836, accent: 0x6fd66a, accentIntensity: 0.8 },
    "cold-cellar": { floor: 0x283230, wall: 0x36423f, accent: 0x66c2a8, accentIntensity: 0.5 },

    // Ember orange
    "boiler-room": { floor: 0x322620, wall: 0x42342a, accent: 0xff7a1a, accentIntensity: 1.0 },

    // Dusty browns / neutrals
    "entrance-hall": { floor: 0x453b32, wall: 0x564a3f, accent: 0xd8b878, accentIntensity: 0.6 },
    foyer: { floor: 0x483d33, wall: 0x594c40, accent: 0xe0c089, accentIntensity: 0.6 },
    "grand-staircase": { floor: 0x4a3e30, wall: 0x5b4d3d, accent: 0xd6b274, accentIntensity: 0.6 },
    "basement-landing": { floor: 0x33302e, wall: 0x423d3a, accent: 0x9aa0a8, accentIntensity: 0.45 },
    "dusty-hallway": { floor: 0x44403a, wall: 0x534e47, accent: 0xc4b48a, accentIntensity: 0.45 },
    "creaking-corridor": { floor: 0x423d36, wall: 0x514b43, accent: 0xc0ab80, accentIntensity: 0.45 },
    "portrait-gallery": { floor: 0x3e342c, wall: 0x4f4339, accent: 0xe6c98c, accentIntensity: 0.6 },
    "abandoned-nursery": { floor: 0x4a4248, wall: 0x5a5158, accent: 0xf0aacb, accentIntensity: 0.55 },
    "servants-quarters": { floor: 0x423b34, wall: 0x524a41, accent: 0xc9b68d, accentIntensity: 0.5 },
    study: { floor: 0x3c2f26, wall: 0x4c3c30, accent: 0xe0b070, accentIntensity: 0.65 },
    library: { floor: 0x3a2e24, wall: 0x4a3b2f, accent: 0xdcae6e, accentIntensity: 0.65 },
    "master-bedroom": { floor: 0x3a3340, wall: 0x483f50, accent: 0xc79de0, accentIntensity: 0.55 },
    attic: { floor: 0x47403a, wall: 0x574e47, accent: 0xc7b48a, accentIntensity: 0.4 },
    gymnasium: { floor: 0x453f36, wall: 0x554d43, accent: 0xd8c074, accentIntensity: 0.5 },
    vault: { floor: 0x303234, wall: 0x404347, accent: 0xffd24d, accentIntensity: 0.8 },
  };
  return themes[roomId] ?? DEFAULT_THEME;
}

// ---------------------------------------------------------------------------
// Material helpers (fresh instances per call)
// ---------------------------------------------------------------------------

function mat(color: number, opts: { rough?: number; metal?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.85,
    metalness: opts.metal ?? 0.05,
  });
}

function emissiveMat(color: number, intensity = 1.2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.0,
  });
}

/** Clamp a coordinate so the prop stays inside the walls. */
function clampInner(v: number, tile: number): number {
  const limit = tile / 2 - WALL_MARGIN;
  return Math.max(-limit, Math.min(limit, v));
}

// ---------------------------------------------------------------------------
// Zone model (tile = 7): island / walk ring / perimeter band / door corridors
// ---------------------------------------------------------------------------

/** Radius of the centerpiece island — a room's anchor prop must fit inside. */
export const ISLAND_R = 1.2;
/** Token walk ring [inner, outer]: tokens stand at r ~= 1.6; no solid prop
 *  taller than 0.06 may sit in this annulus (flat decals/rugs and slim props
 *  with footprint radius <= 0.15 — candles, chains, ropes — are exempt). */
export const RING: readonly [number, number] = [ISLAND_R, 2.0];
/** Perimeter furnishing band runs from here out to the clampInner limit. */
export const PERIM_R = RING[1];
/** Half-width of the walk corridor kept clear in front of any doorway. */
export const DOOR_HALF = 1.1;

/** Wall sides in decor-local space. The decor group is never rotated, so these
 *  map 1:1 onto the world doorway directions (n=north, s=south, e=east, w=west). */
type WallSide = "n" | "s" | "e" | "w";
/** Doorway directions as the rules engine reports them (`placedDoorways`). */
export type DoorSide = "north" | "south" | "east" | "west";

const SIDE_TO_DOOR: Record<WallSide, DoorSide> = { n: "north", s: "south", e: "east", w: "west" };
const ALL_SIDES: readonly WallSide[] = ["n", "s", "e", "w"];

/**
 * What a composer knows about the room's doorways. `hasDoor` errs on the side
 * of caution (true when doors are unknown); `walls()` lists the sides KNOWN to
 * be solid; `bestWall` picks the first known-doorless side of a preference
 * list (else null). Walls only exist on doorless edges in both frontends, so
 * mid-wall props must only ever hang on `bestWall` sides.
 */
export interface DecorCtx {
  hasDoor(s: WallSide): boolean;
  walls(): WallSide[];
  bestWall(prefer: WallSide[]): WallSide | null;
  /** False when the caller passed no doors (legacy / doors-unknown path). */
  known: boolean;
}

function makeCtx(doors?: ReadonlySet<DoorSide>): DecorCtx {
  if (!doors) {
    return { known: false, hasDoor: () => true, walls: () => [], bestWall: () => null };
  }
  const solid = ALL_SIDES.filter((s) => !doors.has(SIDE_TO_DOOR[s]));
  return {
    known: true,
    hasDoor: (s) => doors.has(SIDE_TO_DOOR[s]),
    walls: () => solid.slice(),
    bestWall: (prefer) => prefer.find((s) => !doors.has(SIDE_TO_DOOR[s])) ?? null,
  };
}

function box(
  w: number,
  h: number,
  d: number,
  color: number,
  opts: { rough?: number; metal?: number } = {}
): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
}

function cyl(
  rTop: number,
  rBot: number,
  h: number,
  color: number,
  radial = 12,
  opts: { rough?: number; metal?: number } = {}
): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, radial), mat(color, opts));
}

// ---------------------------------------------------------------------------
// Reusable prop helpers
// ---------------------------------------------------------------------------

/** A floor rug / runner laid flat on the floor (y just above 0). */
function rug(w: number, d: number, color: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, { rough: 1 }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.012;
  g.add(base);
  const trim = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.78, d * 0.78), mat(accent, { rough: 1 }));
  trim.rotation.x = -Math.PI / 2;
  trim.position.y = 0.018;
  g.add(trim);
  return g;
}

/** A small lit candle: stick + flame cone (emissive). */
function candle(height = 0.22, color = 0xf2e9d0, flame = 0xffae3a): THREE.Group {
  const g = new THREE.Group();
  const stick = cyl(0.025, 0.03, height, color, 8);
  stick.position.y = height / 2;
  g.add(stick);
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 8), emissiveMat(flame, 1.6));
  f.position.y = height + 0.05;
  g.add(f);
  return g;
}

/** A tall candlestick holder topped with a candle. */
function candlestick(flame = 0xffae3a): THREE.Group {
  const g = new THREE.Group();
  const base = cyl(0.07, 0.1, 0.04, 0x6a5a3a, 10, { metal: 0.6, rough: 0.5 });
  base.position.y = 0.02;
  g.add(base);
  const stem = cyl(0.025, 0.03, 0.3, 0x7a6840, 8, { metal: 0.6, rough: 0.5 });
  stem.position.y = 0.2;
  g.add(stem);
  const cup = cyl(0.06, 0.04, 0.04, 0x7a6840, 8, { metal: 0.6, rough: 0.5 });
  cup.position.y = 0.36;
  g.add(cup);
  const c = candle(0.16, 0xf2e9d0, flame);
  c.position.y = 0.38;
  g.add(c);
  return g;
}

/** A four-legged table. */
function table(w = 0.9, d = 0.6, h = 0.55, color = 0x5a3d28): THREE.Group {
  const g = new THREE.Group();
  const top = box(w, 0.06, d, color);
  top.position.y = h;
  g.add(top);
  const legGeoColor = color;
  const lx = w / 2 - 0.06;
  const lz = d / 2 - 0.06;
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const leg = box(0.07, h, 0.07, legGeoColor);
    leg.position.set(sx * lx, h / 2, sz * lz);
    g.add(leg);
  }
  return g;
}

/** A simple chair. */
function chair(color = 0x4a3320): THREE.Group {
  const g = new THREE.Group();
  const seatH = 0.32;
  const seat = box(0.34, 0.05, 0.34, color);
  seat.position.y = seatH;
  g.add(seat);
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const leg = box(0.05, seatH, 0.05, color);
    leg.position.set(sx * 0.13, seatH / 2, sz * 0.13);
    g.add(leg);
  }
  const back = box(0.34, 0.36, 0.05, color);
  back.position.set(0, seatH + 0.2, -0.15);
  g.add(back);
  return g;
}

/** A bed with frame, mattress and pillow. */
function bed(w = 0.8, len = 1.4, color = 0x4a2f22, sheet = 0x8a8478): THREE.Group {
  const g = new THREE.Group();
  const frame = box(w, 0.16, len, color);
  frame.position.y = 0.12;
  g.add(frame);
  const mattress = box(w * 0.92, 0.14, len * 0.94, sheet);
  mattress.position.y = 0.26;
  g.add(mattress);
  const pillow = box(w * 0.8, 0.08, 0.22, 0xcfc8ba);
  pillow.position.set(0, 0.36, -len / 2 + 0.2);
  g.add(pillow);
  const headboard = box(w, 0.4, 0.08, color);
  headboard.position.set(0, 0.34, -len / 2 + 0.02);
  g.add(headboard);
  return g;
}

/** A baby crib (for the nursery). */
function crib(color = 0xb8a0a8): THREE.Group {
  const g = new THREE.Group();
  const base = box(0.55, 0.1, 0.4, color);
  base.position.y = 0.34;
  g.add(base);
  // bars
  for (let i = 0; i < 5; i++) {
    const t = (i / 4 - 0.5) * 0.5;
    const bar1 = cyl(0.012, 0.012, 0.28, color, 6);
    bar1.position.set(t, 0.5, 0.2);
    g.add(bar1);
    const bar2 = bar1.clone();
    bar2.position.z = -0.2;
    g.add(bar2);
  }
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const leg = box(0.05, 0.34, 0.05, color);
    leg.position.set(sx * 0.24, 0.17, sz * 0.17);
    g.add(leg);
  }
  return g;
}

/** A wardrobe / cabinet. */
function wardrobe(color = 0x3d2a1c): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.6, 1.1, 0.4, color);
  body.position.y = 0.55;
  g.add(body);
  const doorL = box(0.27, 1.0, 0.04, 0x4a3424);
  doorL.position.set(-0.14, 0.55, 0.2);
  g.add(doorL);
  const doorR = doorL.clone();
  doorR.position.x = 0.14;
  g.add(doorR);
  const knobL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), mat(0xb8a060, { metal: 0.7, rough: 0.4 }));
  knobL.position.set(-0.02, 0.55, 0.23);
  g.add(knobL);
  const knobR = knobL.clone();
  knobR.position.x = 0.02;
  g.add(knobR);
  return g;
}

/** A bookshelf filled with rows of colored books. The books are three tinted
 *  row-slabs per shelf in ONE InstancedMesh — reads as packed spines at play
 *  distance for a fraction of the meshes (the library stands five of these). */
function bookshelf(w = 0.8, h = 1.3, color = 0x3a2718): THREE.Group {
  const g = new THREE.Group();
  const back = box(w, h, 0.08, color);
  back.position.set(0, h / 2, -0.14);
  g.add(back);
  const sideL = box(0.06, h, 0.32, color);
  sideL.position.set(-w / 2 + 0.03, h / 2, 0);
  g.add(sideL);
  const sideR = sideL.clone();
  sideR.position.x = w / 2 - 0.03;
  g.add(sideR);
  const shelves = 4;
  const bookColors = [0x7a2222, 0x224a2a, 0x223a6a, 0x6a5a22, 0x4a2a5a, 0x6a3a1a];
  const rowT: Array<{ pos: [number, number, number]; scale: [number, number, number]; color: number }> = [];
  for (let s = 0; s <= shelves; s++) {
    const y = (s / shelves) * (h - 0.1) + 0.05;
    const plank = box(w - 0.04, 0.04, 0.3, color);
    plank.position.set(0, y, 0);
    g.add(plank);
    if (s < shelves) {
      // three book-row slabs on this shelf, varied heights/tints
      const rows = 3;
      const rw = (w - 0.16) / rows;
      for (let b = 0; b < rows; b++) {
        const bx = -w / 2 + 0.08 + rw * (b + 0.5);
        const bh = 0.18 + ((b * 7 + s * 3) % 5) * 0.014;
        rowT.push({
          pos: [bx, y + bh / 2 + 0.02, 0],
          scale: [rw * 0.92, bh, 0.22],
          color: bookColors[(b + s * 2) % bookColors.length],
        });
      }
    }
  }
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { rough: 0.85 }), rowT));
  return g;
}

/** A wall-hung painting / portrait. */
function painting(w = 0.5, h = 0.65, frame = 0x5a4326, canvas = 0x2a2832): THREE.Group {
  const g = new THREE.Group();
  const f = box(w, h, 0.05, frame, { metal: 0.3, rough: 0.6 });
  g.add(f);
  const c = box(w * 0.82, h * 0.82, 0.02, canvas);
  c.position.z = 0.03;
  g.add(c);
  return g;
}

/** A wall sconce: bracket + small flame. */
function sconce(flame = 0xffae3a): THREE.Group {
  const g = new THREE.Group();
  const bracket = box(0.06, 0.18, 0.06, 0x4a4038, { metal: 0.5, rough: 0.5 });
  g.add(bracket);
  const cup = cyl(0.05, 0.03, 0.06, 0x5a4a30, 8, { metal: 0.5 });
  cup.position.set(0, 0.06, 0.06);
  g.add(cup);
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 8), emissiveMat(flame, 1.5));
  f.position.set(0, 0.16, 0.06);
  g.add(f);
  return g;
}

/** A wooden barrel. */
function barrel(color = 0x5a3c24): THREE.Group {
  const g = new THREE.Group();
  const body = cyl(0.22, 0.26, 0.5, color, 14);
  body.position.y = 0.25;
  g.add(body);
  for (const y of [0.08, 0.42]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.018, 6, 16), mat(0x2a2420, { metal: 0.6, rough: 0.5 }));
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  return g;
}

/** A stacked crate / box. */
function crate(size = 0.4, color = 0x6a4a2c): THREE.Group {
  const g = new THREE.Group();
  const b = box(size, size, size, color);
  b.position.y = size / 2;
  g.add(b);
  // plank edges
  const edge = box(size * 1.02, 0.04, 0.04, 0x4a3420);
  edge.position.set(0, size, size / 2);
  g.add(edge);
  const edge2 = edge.clone();
  edge2.position.z = -size / 2;
  g.add(edge2);
  return g;
}

/** A cauldron (rounded pot) with optional bubbling emissive top. */
function cauldron(glow = 0x6fd66a): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(0x1c1c1c, { metal: 0.4, rough: 0.6 }));
  pot.rotation.x = Math.PI;
  pot.position.y = 0.3;
  g.add(pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 8, 18), mat(0x1c1c1c, { metal: 0.4, rough: 0.6 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.3;
  g.add(rim);
  const brew = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), emissiveMat(glow, 0.9));
  brew.rotation.x = -Math.PI / 2;
  brew.position.y = 0.29;
  g.add(brew);
  // three little legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = box(0.04, 0.12, 0.04, 0x141414, { metal: 0.4 });
    leg.position.set(Math.cos(a) * 0.18, 0.06, Math.sin(a) * 0.18);
    g.add(leg);
  }
  return g;
}

/** A stone pillar. */
function pillar(h = WALL_H, color = 0x6a6258): THREE.Group {
  const g = new THREE.Group();
  const shaft = cyl(0.16, 0.18, h - 0.2, color, 12, { rough: 0.95 });
  shaft.position.y = (h - 0.2) / 2 + 0.1;
  g.add(shaft);
  const base = box(0.42, 0.12, 0.42, color, { rough: 0.95 });
  base.position.y = 0.06;
  g.add(base);
  const cap = box(0.42, 0.12, 0.42, color, { rough: 0.95 });
  cap.position.y = h - 0.06;
  g.add(cap);
  return g;
}

/** A stone sarcophagus / tomb. */
function sarcophagus(color = 0x55504a): THREE.Group {
  const g = new THREE.Group();
  const base = box(0.7, 0.4, 1.5, color, { rough: 0.95 });
  base.position.y = 0.2;
  g.add(base);
  const lid = box(0.74, 0.12, 1.54, 0x615b54, { rough: 0.95 });
  lid.position.y = 0.46;
  g.add(lid);
  // a carved figure ridge on the lid
  const effigy = box(0.3, 0.06, 0.9, 0x6c655d, { rough: 0.95 });
  effigy.position.y = 0.54;
  g.add(effigy);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), mat(0x6c655d, { rough: 0.95 }));
  head.position.set(0, 0.56, -0.5);
  g.add(head);
  return g;
}

/** A church altar with cloth. */
function altar(accent: number): THREE.Group {
  const g = new THREE.Group();
  const slab = box(0.9, 0.12, 0.5, 0x6a6258, { rough: 0.95 });
  slab.position.y = 0.74;
  g.add(slab);
  const stem = box(0.6, 0.6, 0.38, 0x5a544c, { rough: 0.95 });
  stem.position.y = 0.4;
  g.add(stem);
  const cloth = box(0.84, 0.02, 0.44, accent, { rough: 1 });
  cloth.position.y = 0.81;
  g.add(cloth);
  return g;
}

/** A church pew (long bench with a back). */
function pew(color = 0x4a3622): THREE.Group {
  const g = new THREE.Group();
  const seat = box(1.2, 0.06, 0.3, color);
  seat.position.y = 0.4;
  g.add(seat);
  const back = box(1.2, 0.4, 0.05, color);
  back.position.set(0, 0.6, -0.13);
  g.add(back);
  for (const sx of [-1, 1]) {
    const end = box(0.06, 0.8, 0.3, color);
    end.position.set(sx * 0.57, 0.4, 0);
    g.add(end);
  }
  return g;
}

/** A glowing stained-glass / arched window panel (hangs on a wall). */
function glowWindow(accent: number): THREE.Group {
  const g = new THREE.Group();
  const frame = box(0.7, 1.2, 0.06, 0x3a2e22, { rough: 0.7 });
  g.add(frame);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.04), emissiveMat(accent, 0.8));
  glass.position.z = 0.04;
  g.add(glass);
  // mullions
  const v = box(0.03, 1.04, 0.02, 0x2a2018);
  v.position.z = 0.05;
  g.add(v);
  const h = box(0.56, 0.03, 0.02, 0x2a2018);
  h.position.z = 0.05;
  g.add(h);
  return g;
}

/** A hanging chandelier (suspended from the ceiling). The six candles are two
 *  InstancedMeshes (sticks + flames) so a room can afford a pair of these. */
function chandelier(flame = 0xffae3a): THREE.Group {
  const g = new THREE.Group();
  const chain = cyl(0.01, 0.01, 0.4, 0x3a352c, 6, { metal: 0.6 });
  chain.position.y = WALL_H - 0.2;
  g.add(chain);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 18), mat(0x6a5a3a, { metal: 0.6, rough: 0.4 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = WALL_H - 0.45;
  g.add(ring);
  const stickT: Array<{ pos: [number, number, number] }> = [];
  const flameT: Array<{ pos: [number, number, number] }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cx = Math.cos(a) * 0.28;
    const cz = Math.sin(a) * 0.28;
    stickT.push({ pos: [cx, WALL_H - 0.45 + 0.06, cz] });
    flameT.push({ pos: [cx, WALL_H - 0.45 + 0.17, cz] });
  }
  g.add(instanced(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 8), mat(0xf2e9d0), stickT));
  g.add(instanced(new THREE.ConeGeometry(0.03, 0.08, 8), emissiveMat(flame, 1.6), flameT));
  return g;
}

/** A wispy cobweb stretched across a corner (a thin triangular plane). */
function cobweb(size = 0.5): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.16, roughness: 1, side: THREE.DoubleSide })
  );
  return m;
}

/** A glowing pentagram decal laid flat on the floor. */
function pentagramDecal(accent: number, radius = 1.3): THREE.Group {
  const g = new THREE.Group();
  const ringMat = emissiveMat(accent, 1.0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  // five-point star drawn as segments between vertices two steps apart
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0.02, Math.sin(a) * radius));
  }
  const order = [0, 2, 4, 1, 3, 0];
  for (let i = 0; i < 5; i++) {
    const a = pts[order[i]];
    const b = pts[order[i + 1]];
    const len = a.distanceTo(b);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.01, 0.04), emissiveMat(accent, 1.0));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    seg.position.copy(mid);
    seg.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    g.add(seg);
  }
  return g;
}

/** A heavy metal vault door leaning against the wall. */
function vaultDoor(): THREE.Group {
  const g = new THREE.Group();
  const door = cyl(0.7, 0.7, 0.12, 0x55585c, 24, { metal: 0.85, rough: 0.35 });
  door.rotation.x = Math.PI / 2;
  door.position.y = 0.75;
  g.add(door);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 18), mat(0x6a6e72, { metal: 0.9, rough: 0.3 }));
  wheel.position.set(0, 0.75, 0.08);
  g.add(wheel);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spoke = box(0.04, 0.42, 0.03, 0x6a6e72, { metal: 0.9, rough: 0.3 });
    spoke.position.set(0, 0.75, 0.08);
    spoke.rotation.z = a;
    g.add(spoke);
  }
  return g;
}

/** A pile of gold coins/ingots. */
function goldPile(): THREE.Group {
  const g = new THREE.Group();
  const goldM = () => mat(0xffd24d, { metal: 0.9, rough: 0.25 });
  const heap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 14), goldM());
  heap.position.y = 0.08;
  g.add(heap);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const coin = cyl(0.05, 0.05, 0.02, 0xffd24d, 12, { metal: 0.9, rough: 0.25 });
    coin.position.set(Math.cos(a) * 0.18, 0.01, Math.sin(a) * 0.18);
    coin.rotation.z = Math.PI / 2;
    coin.rotation.y = a;
    g.add(coin);
  }
  return g;
}

/** A stepped staircase prop with a banister. */
function staircase(): THREE.Group {
  const g = new THREE.Group();
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const step = box(1.4, 0.18, 0.26, 0x5a4226);
    step.position.set(0, 0.09 + i * 0.18, -0.8 + i * 0.26);
    g.add(step);
  }
  // banister rail
  const rail = box(0.06, 0.06, steps * 0.26 + 0.1, 0x3a2a18);
  rail.position.set(-0.68, 0.18 + (steps * 0.18) / 2, -0.65 + (steps * 0.26) / 2);
  rail.rotation.x = -Math.atan2(steps * 0.18, steps * 0.26);
  g.add(rail);
  for (let i = 0; i < steps; i += 2) {
    const post = box(0.05, 0.4, 0.05, 0x3a2a18);
    post.position.set(-0.68, 0.09 + i * 0.18 + 0.2, -0.8 + i * 0.26);
    g.add(post);
  }
  return g;
}

/** A potted dead plant (for the conservatory). */
function deadPlant(): THREE.Group {
  const g = new THREE.Group();
  const pot = cyl(0.14, 0.1, 0.2, 0x6a4a36, 12, { rough: 0.9 });
  pot.position.y = 0.1;
  g.add(pot);
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), mat(0x2a2018, { rough: 1 }));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.2;
  g.add(dirt);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const stem = cyl(0.006, 0.012, 0.4 + (i % 3) * 0.1, 0x4a4226, 5, { rough: 1 });
    stem.position.set(Math.cos(a) * 0.05, 0.4, Math.sin(a) * 0.05);
    stem.rotation.z = (Math.cos(a) * Math.PI) / 12;
    stem.rotation.x = (Math.sin(a) * Math.PI) / 12;
    g.add(stem);
  }
  return g;
}

/** A bone niche (skull shelf) for catacombs/crypts — shelf + instanced skulls
 *  and jaws (3 objects; the crypt stacks eight niches). */
function boneNiche(): THREE.Group {
  const g = new THREE.Group();
  const shelf = box(0.5, 0.04, 0.2, 0x4a4038, { rough: 0.95 });
  g.add(shelf);
  const skullT = [0, 1, 2].map((i) => ({ pos: [-0.15 + i * 0.15, 0.08, 0] as [number, number, number] }));
  g.add(instanced(new THREE.SphereGeometry(0.06, 10, 10), mat(0xd8d0c0, { rough: 0.9 }), skullT));
  const jawT = [0, 1, 2].map((i) => ({ pos: [-0.15 + i * 0.15, 0.03, 0.02] as [number, number, number] }));
  g.add(instanced(new THREE.BoxGeometry(0.07, 0.03, 0.05), mat(0xcfc6b4, { rough: 0.9 }), jawT));
  return g;
}

/** A rocking chair. */
function rockingChair(color = 0x4a3320): THREE.Group {
  const g = new THREE.Group();
  const c = chair(color);
  g.add(c);
  for (const sx of [-1, 1]) {
    const rocker = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 12, Math.PI * 0.7), mat(color));
    rocker.rotation.z = Math.PI / 2;
    rocker.rotation.x = Math.PI / 2;
    rocker.position.set(sx * 0.13, 0.02, 0);
    g.add(rocker);
  }
  return g;
}

/** A desk globe. */
function globe(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), mat(0x2a5a7a, { rough: 0.6 }));
  ball.position.y = 0.14;
  g.add(ball);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.01, 6, 18), mat(0xb8a060, { metal: 0.7, rough: 0.4 }));
  ring.position.y = 0.14;
  ring.rotation.x = 0.3;
  g.add(ring);
  const stand = cyl(0.02, 0.04, 0.05, 0x6a5a3a, 8, { metal: 0.5 });
  stand.position.y = 0.02;
  g.add(stand);
  return g;
}

// ---------------------------------------------------------------------------
// Large furnishings (the 7-unit-room dressing set)
// ---------------------------------------------------------------------------

/** A stone fireplace: surround + mantel shelf, black firebox recess and a
 *  glowing ember bed with two guttering flames. Built with its back at z = 0
 *  opening toward +z, so it stands flush against a wall. Pass `light: true`
 *  ONLY in rooms whose composer adds no other PointLight (1-light budget). */
function fireplace(accent = 0xff7a2a, opts: { light?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0x5a544c, { rough: 0.95 });
  const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.45), stone);
  jambL.position.set(-0.6, 0.6, 0.225);
  g.add(jambL);
  const jambR = jambL.clone();
  jambR.position.x = 0.6;
  g.add(jambR);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.45), stone);
  lintel.position.set(0, 1.3, 0.225);
  g.add(lintel);
  const mantel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.55), stone);
  mantel.position.set(0, 1.44, 0.27);
  g.add(mantel);
  const recess = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.08), mat(0x0a0908, { rough: 1 }));
  recess.position.set(0, 0.6, 0.05);
  g.add(recess);
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.7), stone);
  hearth.position.set(0, 0.03, 0.35);
  g.add(hearth);
  const embers = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.25), emissiveMat(accent, 1.4));
  embers.rotation.x = -Math.PI / 2;
  embers.position.set(0, 0.08, 0.28);
  g.add(embers);
  const flameM = emissiveMat(0xffb054, 1.5);
  for (const fx of [-0.16, 0.14]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), flameM);
    f.position.set(fx, 0.16, 0.28);
    g.add(f);
  }
  if (opts.light) {
    const l = new THREE.PointLight(accent, 0.9, 4.5, 2);
    l.position.set(0, 0.5, 0.4);
    g.add(l);
  }
  return g;
}

/** A grandfather clock: tall dark case, arched crown, white face with stopped
 *  hands, and a brass pendulum glinting in its slot. */
function grandfatherClock(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x2e1f14, { rough: 0.8 });
  const brass = mat(0xb8a060, { metal: 0.75, rough: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.1, 0.4), wood);
  body.position.y = 1.05;
  g.add(body);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.38, 14, 1, false, -Math.PI / 2, Math.PI), wood);
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, 2.1, 0);
  g.add(crown);
  const face = cyl(0.16, 0.16, 0.02, 0xe8e0d0, 18, { rough: 0.5 });
  face.rotation.x = Math.PI / 2;
  face.position.set(0, 1.7, 0.21);
  g.add(face);
  const hourHand = box(0.02, 0.09, 0.008, 0x1a140e);
  hourHand.position.set(0.01, 1.73, 0.225);
  hourHand.rotation.z = -0.6;
  g.add(hourHand);
  const minuteHand = box(0.014, 0.13, 0.008, 0x1a140e);
  minuteHand.position.set(-0.02, 1.72, 0.225);
  minuteHand.rotation.z = 0.9;
  g.add(minuteHand);
  const slot = box(0.3, 0.9, 0.02, 0x120c08, { rough: 1 });
  slot.position.set(0, 0.85, 0.2);
  g.add(slot);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 6), brass);
  rod.position.set(0, 1.0, 0.21);
  g.add(rod);
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 14), brass);
  bob.rotation.x = Math.PI / 2;
  bob.position.set(0, 0.7, 0.21);
  g.add(bob);
  return g;
}

/** A full-length standing mirror leaning back ~6 degrees on splayed feet, its
 *  glass darkly reflective (and, by default, cracked). */
function standingMirror(cracked = true): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x3a2a1c, { rough: 0.75 });
  const lean = new THREE.Group();
  lean.rotation.x = -0.105; // ~6 degrees back
  g.add(lean);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.06), wood);
  frame.position.y = 0.85;
  lean.add(frame);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 1.56),
    new THREE.MeshStandardMaterial({ color: 0x9fb4bd, metalness: 0.9, roughness: 0.15 })
  );
  glass.position.set(0, 0.85, 0.035);
  lean.add(glass);
  if (cracked) {
    const crackM = mat(0x10100e, { rough: 1 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.9, 0.006), crackM);
    c1.position.set(0.08, 0.9, 0.04);
    c1.rotation.z = 0.35;
    lean.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.006), crackM);
    c2.position.set(-0.1, 0.7, 0.04);
    c2.rotation.z = -0.6;
    lean.add(c2);
  }
  for (const sx of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.4), wood);
    foot.position.set(sx * 0.26, 0.025, 0.08);
    g.add(foot);
  }
  return g;
}

/** An upright piano with its lid propped open, seven instanced black keys and
 *  two candles guttering on the top board. Keys face +z. */
function uprightPiano(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x241812, { rough: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.55), wood);
  body.position.set(0, 0.65, -0.08);
  g.add(body);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.28), wood);
  shelf.position.set(0, 0.78, 0.28);
  g.add(shelf);
  const whites = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.025, 0.22), mat(0xe6ddc8, { rough: 0.5 }));
  whites.position.set(0, 0.825, 0.28);
  g.add(whites);
  const keyT = Array.from({ length: 7 }, (_, i) => ({
    pos: [-0.54 + i * 0.18, 0.848, 0.24] as [number, number, number],
  }));
  g.add(instanced(new THREE.BoxGeometry(0.05, 0.02, 0.12), mat(0x0c0c0c, { rough: 0.4 }), keyT));
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.5), wood);
  lid.position.set(0, 1.42, -0.28);
  lid.rotation.x = -0.5;
  g.add(lid);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.08), wood);
    leg.position.set(sx * 0.62, 0.39, 0.3);
    g.add(leg);
    const c = candle(0.12);
    c.position.set(sx * 0.5, 1.3, 0.05);
    g.add(c);
  }
  return g;
}

/** A four-poster bed: the shared bed prop under four tall posts, canopy rails
 *  and one torn half-transparent canopy sheet sagging over the head end. */
function fourPosterBed(): THREE.Group {
  const g = new THREE.Group();
  g.add(bed(1.1, 1.9, 0x33223a, 0x5a5468));
  const wood = mat(0x2c1c26, { rough: 0.8 });
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, wood);
      post.position.set(sx * 0.52, 1.0, sz * 0.9);
      g.add(post);
    }
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.05, 0.05), wood);
    rail.position.set(0, 1.98, sz * 0.9);
    g.add(rail);
  }
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.85), wood);
    rail.position.set(sx * 0.52, 1.98, 0);
    g.add(rail);
  }
  const canopy = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x4a3a52, roughness: 1, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  );
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.set(0, 1.95, -0.28);
  g.add(canopy);
  return g;
}

/** A wall-mounted weapon rack: back board, three pegs, an axe, a sword — and
 *  one conspicuously empty peg. Origin mid-board, hangs face +z. */
function weaponRack(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x33261a, { rough: 0.85 });
  const iron = mat(0x8a8e92, { metal: 0.8, rough: 0.35 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.06), wood);
  g.add(board);
  const pegGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6);
  for (const px of [-0.35, 0, 0.35]) {
    const peg = new THREE.Mesh(pegGeo, wood);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(px, 0.5, 0.08);
    g.add(peg);
  }
  // the axe, hung on the left peg
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.9, 8), wood);
  haft.position.set(-0.35, 0.05, 0.1);
  g.add(haft);
  const axeHead = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.24), iron);
  axeHead.position.set(-0.35, 0.36, 0.12);
  g.add(axeHead);
  // the sword, hung on the middle peg
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.015), iron);
  blade.position.set(0, -0.02, 0.1);
  g.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.03), wood);
  guard.position.set(0, 0.42, 0.1);
  g.add(guard);
  // the right peg hangs empty — whatever it held is loose in the house
  return g;
}

/** Two wall planks of dubious specimen jars, their contents faintly glowing.
 *  Origin mid-shelf, hangs face +z. */
function specimenShelf(glow = 0x6fd66a): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x3a2c1e, { rough: 0.85 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x9fb4a8, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.4 });
  const brewM = emissiveMat(glow, 0.8);
  const jarGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10);
  const brewGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.09, 8);
  const rows: Array<[number, number[]]> = [
    [0.22, [-0.3, 0, 0.3]],
    [-0.22, [-0.18, 0.22]],
  ];
  for (const [y, xs] of rows) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.22), wood);
    plank.position.set(0, y - 0.11, 0.1);
    g.add(plank);
    for (const x of xs) {
      const jar = new THREE.Mesh(jarGeo, glassM);
      jar.position.set(x, y, 0.1);
      g.add(jar);
      const brew = new THREE.Mesh(brewGeo, brewM);
      brew.scale.y = 0.6 + ((Math.abs(x * 10) | 0) % 3) * 0.2;
      brew.position.set(x, y - 0.03, 0.1);
      g.add(brew);
    }
  }
  return g;
}

/** A weathered stone statue on a pedestal — a robed figure, head bowed, one
 *  arm raised as if warding something off. ~1.7 tall. */
function statue(color = 0x8a8478): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(color, { rough: 0.95 });
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), stone);
  pedestal.position.y = 0.25;
  g.add(pedestal);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.9, 10), stone);
  robe.position.y = 0.95;
  g.add(robe);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), stone);
  shoulders.scale.set(1.2, 0.6, 0.9);
  shoulders.position.y = 1.42;
  g.add(shoulders);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), stone);
  head.position.set(0, 1.55, 0.03);
  g.add(head);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.07), stone);
  arm.position.set(0.16, 1.38, 0.08);
  arm.rotation.z = -0.7;
  g.add(arm);
  return g;
}

/** A rank of seven brass organ pipes above a wall-mounted wind chest, heights
 *  rising to the middle. Origin at the chest center, hangs face +z. */
function organPipes(): THREE.Group {
  const g = new THREE.Group();
  const chest = box(1.4, 0.5, 0.26, 0x2e2018, { rough: 0.8 });
  chest.position.z = 0.13;
  g.add(chest);
  const heights = [0.9, 1.2, 1.5, 1.8, 1.5, 1.2, 0.9];
  const pipeT = heights.map((h, i) => ({
    pos: [-0.54 + i * 0.18, 0.25 + h / 2, 0.14] as [number, number, number],
    scale: [1, h, 1] as [number, number, number],
  }));
  g.add(instanced(new THREE.CylinderGeometry(0.055, 0.055, 1, 10), mat(0x9a7a3a, { metal: 0.8, rough: 0.35 }), pipeT));
  return g;
}

/** A domed birdcage hanging from the ceiling on a thin rod, its door ajar and
 *  its perch bare. Built in absolute room coordinates (cage bottom at y ~2.0,
 *  rod up to WALL_H); place with x/z only. */
function hangingBirdcage(): THREE.Group {
  const g = new THREE.Group();
  const brass = mat(0x8a7448, { metal: 0.7, rough: 0.4 });
  const bottomY = 2.0;
  const topY = bottomY + 0.42;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, WALL_H - topY, 6), brass);
  rod.position.y = (WALL_H + topY) / 2;
  g.add(rod);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), brass);
  floor.position.y = bottomY;
  g.add(floor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 16), brass);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = bottomY + 0.3;
  g.add(ring);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), brass);
  dome.position.y = bottomY + 0.24;
  g.add(dome);
  const barT = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return { pos: [Math.cos(a) * 0.21, bottomY + 0.16, Math.sin(a) * 0.21] as [number, number, number] };
  });
  g.add(instanced(new THREE.CylinderGeometry(0.005, 0.005, 0.3, 4), brass, barT));
  const perch = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5), brass);
  perch.rotation.z = Math.PI / 2;
  perch.position.y = bottomY + 0.16;
  g.add(perch);
  return g;
}

/** A reading lectern: a tilted top on a stand, an open book abandoned mid-rite. */
function lectern(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x33241a, { rough: 0.8 });
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.0, 8), wood);
  stand.position.y = 0.5;
  g.add(stand);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.32), wood);
  top.position.y = 1.05;
  top.rotation.x = -0.35;
  g.add(top);
  const pageM = mat(0xd8ccae, { rough: 0.9 });
  for (const sx of [-1, 1]) {
    const page = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.24), pageM);
    page.position.set(sx * 0.09, 1.09, -0.02);
    page.rotation.x = -0.35;
    page.rotation.z = sx * 0.06;
    g.add(page);
  }
  return g;
}

/** A wooden ladder leaning against a wall (lean baked in; back faces -z). */
function leaningLadder(h = 2.4): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x4a3826, { rough: 0.9 });
  const lean = new THREE.Group();
  lean.rotation.x = -0.22;
  g.add(lean);
  const railGeo = new THREE.CylinderGeometry(0.025, 0.025, h, 6);
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, wood);
    rail.position.set(sx * 0.18, h / 2, 0);
    lean.add(rail);
  }
  for (let i = 0; i < 5; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.035, 0.035), wood);
    rung.position.set(0, 0.3 + i * (h - 0.6) / 4, 0);
    lean.add(rung);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Room composition
// ---------------------------------------------------------------------------

/** Place a prop group at an inner-clamped position. */
function place(group: THREE.Group, child: THREE.Object3D, x: number, z: number, tile: number, rotY = 0): void {
  child.position.x = clampInner(x, tile);
  child.position.z = clampInner(z, tile);
  child.rotation.y = rotY;
  group.add(child);
}

/** Hang a wall-mounted prop flush against one of the four walls. */
function placeOnWall(
  group: THREE.Group,
  child: THREE.Object3D,
  side: "n" | "s" | "e" | "w",
  along: number,
  y: number,
  tile: number
): void {
  const edge = tile / 2 - 0.05;
  switch (side) {
    case "n":
      child.position.set(clampInner(along, tile), y, -edge);
      child.rotation.y = 0;
      break;
    case "s":
      child.position.set(clampInner(along, tile), y, edge);
      child.rotation.y = Math.PI;
      break;
    case "w":
      child.position.set(-edge, y, clampInner(along, tile));
      child.rotation.y = Math.PI / 2;
      break;
    case "e":
      child.position.set(edge, y, clampInner(along, tile));
      child.rotation.y = -Math.PI / 2;
      break;
  }
  group.add(child);
}

/** Lay a stain/mold/soot decal flat on the floor at (x,z). */
function placeFloorStain(
  g: THREE.Group,
  kind: "water" | "blood" | "mold" | "soot",
  size: number,
  x: number,
  z: number,
  tile: number,
  seed: number
): void {
  const s = stainDecal(kind, size, seed);
  s.rotation.x = -Math.PI / 2;
  place(g, s as unknown as THREE.Group, x, z, tile);
}

// ---------------------------------------------------------------------------
// Placement-law helpers (island / walk ring / door corridors)
// ---------------------------------------------------------------------------

/** Scatter-system count scaling: x1.5 in the big 7-unit rooms. */
function scaleN(n: number, tile: number): number {
  return tile >= 6 ? Math.ceil(n * 1.5) : n;
}

/** Flat floor-scatter count scaling: x2.2 in the big rooms. Only for the
 *  ring law's flat-prop exemption (papers, planks, shards — height <= 0.06):
 *  floor area grew x3 while scaleN only grew x1.5, so plank acreage read
 *  empty from the high tactical camera. These are single InstancedMeshes, so
 *  the extra coverage costs instances, not draw calls. */
function scaleFlat(n: number, tile: number): number {
  return tile >= 6 ? Math.ceil(n * 2.2) : n;
}

/** Scatter-system spread scaling: grows with the floor (identity at tile 4). */
function scaleSpread(spread: number, tile: number): number {
  return (spread * tile) / 4;
}

/** Place a scatter group whose instances fan out ±spread/2 around its origin,
 *  pulling the origin inward so no instance escapes the inner bounds. */
function placeScatter(g: THREE.Group, child: THREE.Object3D, x: number, z: number, tile: number, spread: number): void {
  const lim = Math.max(0, tile / 2 - WALL_MARGIN - spread / 2);
  child.position.x = Math.max(-lim, Math.min(lim, x));
  child.position.z = Math.max(-lim, Math.min(lim, z));
  g.add(child);
}

/** True when (x,z) lands in the walk corridor kept clear in front of a doorway
 *  on any side that has (or, doors unknown, may have) a door. */
function inDoorCorridor(ctx: DecorCtx, x: number, z: number, pad = 0): boolean {
  const strips: Array<[WallSide, number, number]> = [
    ["n", x, -z],
    ["s", x, z],
    ["w", z, -x],
    ["e", z, x],
  ];
  for (const [side, along, depth] of strips) {
    if (!ctx.hasDoor(side)) continue;
    if (Math.abs(along) <= DOOR_HALF + pad && depth >= RING[1] - pad) return true;
  }
  return false;
}

/** x/z/facing for a prop standing against wall `side`, `fromWall` units in,
 *  offset `along` the wall, rotated to face into the room. */
function wallSlot(side: WallSide, along: number, fromWall: number, tile: number): { x: number; z: number; rot: number } {
  const d = tile / 2 - fromWall;
  switch (side) {
    case "n": return { x: along, z: -d, rot: 0 };
    case "s": return { x: along, z: d, rot: Math.PI };
    case "w": return { x: -d, z: along, rot: Math.PI / 2 };
    case "e": return { x: d, z: along, rot: -Math.PI / 2 };
  }
}

/** Stand a floor prop in the perimeter band against a doorless wall. When no
 *  side in `prefer` is known doorless, falls back to `prefer[0]` shifted to an
 *  off-mid slot so it can never block a doorway. Returns the resolved slot so
 *  dependent props (a candle on the console, jars on the counter) can join it. */
function standAtWall(
  g: THREE.Group,
  ctx: DecorCtx,
  child: THREE.Object3D,
  prefer: WallSide[],
  tile: number,
  opts: { along?: number; fromWall?: number; rot?: number } = {}
): { side: WallSide; along: number } {
  let side = ctx.bestWall(prefer);
  let along = opts.along ?? 0;
  if (!side) {
    side = prefer[0];
    if (Math.abs(along) < DOOR_HALF + 0.7) along = (along >= 0 ? 1 : -1) * tile * 0.3;
  }
  const s = wallSlot(side, along, opts.fromWall ?? 0.7, tile);
  place(g, child, s.x, s.z, tile, s.rot + (opts.rot ?? 0));
  return { side, along };
}

/** Hang a wall prop that wants a mid-wall spot on a doorless wall. Doors
 *  known: the first doorless side of `prefer` (skipped entirely when every
 *  wall is a doorway — walls only exist on doorless edges). Doors unknown:
 *  hangs on `prefer[0]` shifted clear of the door corridor. `make` is lazy so
 *  a skipped prop allocates nothing. Returns the side used, or null. */
function hangMid(
  g: THREE.Group,
  ctx: DecorCtx,
  make: () => THREE.Object3D,
  prefer: WallSide[],
  y: number,
  tile: number,
  opts: { along?: number; halfW?: number } = {}
): WallSide | null {
  const along = opts.along ?? 0;
  const side = ctx.bestWall(prefer);
  if (side) {
    placeOnWall(g, make(), side, along, y, tile);
    return side;
  }
  if (!ctx.known) {
    const clear = Math.max(Math.abs(along), DOOR_HALF + (opts.halfW ?? 0.5));
    placeOnWall(g, make(), prefer[0], (along >= 0 ? 1 : -1) * clear, y, tile);
    return prefer[0];
  }
  return null;
}

/** A funnel web tucked high into each wall-top corner (corners never carry a
 *  doorway, so these are safe whatever the layout). */
function cornerCobwebs(g: THREE.Group, tile: number, count = 4): void {
  const e = tile / 2 - 0.6;
  const corners: Array<[WallSide, number, number]> = [
    ["n", -e, 0.6],
    ["e", -e, 0.5],
    ["s", e, 0.55],
    ["w", e, 0.5],
  ];
  for (const [side, along, size] of corners.slice(0, count)) {
    placeOnWall(g, cobwebFunnel(size), side, along, WALL_H - 0.4, tile);
  }
}

/** Dress each known-doorless wall with portraits and sconces (the >=2 hung
 *  items per solid wall rule). Doors unknown: falls back to the two legacy
 *  walls, at offsets already clear of any possible mid-wall doorway. */
function dressWalls(
  g: THREE.Group,
  ctx: DecorCtx,
  tile: number,
  accent: number,
  opts: { portraits?: number; sconces?: number } = {}
): void {
  const sides = ctx.known ? ctx.walls() : (["n", "e"] as WallSide[]);
  const pOff = Math.max(tile * 0.22, DOOR_HALF + 0.35);
  const sOff = Math.max(tile * 0.36, DOOR_HALF + 0.1);
  sides.forEach((side, i) => {
    // the first two walls get the full dressing; further walls a lighter one,
    // keeping three-solid-wall rooms inside the mesh budget
    const nP = i < 2 ? opts.portraits ?? 2 : 1;
    const nS = i < 2 ? opts.sconces ?? 2 : 1;
    if (nP >= 1) placeOnWall(g, framedPortrait(0.5, 0.65), side, -pOff, 1.6, tile);
    if (nP >= 2) placeOnWall(g, framedPortrait(0.5, 0.65), side, pOff, 1.6, tile);
    if (nS >= 1) placeOnWall(g, sconce(accent), side, -sOff, 1.7, tile);
    if (nS >= 2) placeOnWall(g, sconce(accent), side, sOff, 1.7, tile);
  });
}

/**
 * Shared "decay kit": general dilapidation any room can wear — cobwebbed
 * corners, a wall crack, peeling wallpaper, dust in a corner and a floor stain.
 * Tuned to be cheap (instanced cracks/stains) and placed at the edges so the
 * centre stays clear. `seed` varies the clutter per room. Big rooms web over
 * the two remaining corners and pick up an extra stain and dust drift.
 */
function decayKit(g: THREE.Group, t: RoomTheme, tile: number, seed = 1): void {
  const edge = tile / 2 - 0.6;
  placeOnWall(g, cobwebFunnel(0.6), "n", -edge, WALL_H - 0.4, tile);
  placeOnWall(g, cobwebFunnel(0.5), "e", edge, WALL_H - 0.4, tile);
  placeOnWall(g, wallCrack(0.9, seed) as unknown as THREE.Object3D, "w", 0.1, 1.4, tile);
  placeOnWall(g, peelingWallpaper(0.5, 0.8, t.wall + 0x101010, t.floor), "s", edge - 0.2, 1.3, tile);
  place(g, dustPile(0.16, t.floor + 0x080808) as unknown as THREE.Group, -edge, edge, tile);
  placeFloorStain(g, "water", 0.5, edge * 0.6, -edge * 0.6, tile, seed + 7);
  if (tile >= 6) {
    placeOnWall(g, cobwebFunnel(0.55), "s", -edge, WALL_H - 0.4, tile);
    placeOnWall(g, cobwebFunnel(0.5), "e", -edge, WALL_H - 0.4, tile);
    placeFloorStain(g, "water", 0.55, -edge * 0.5, -edge * 0.55, tile, seed + 11);
    place(g, dustPile(0.15, t.floor + 0x080808) as unknown as THREE.Group, edge, -edge, tile);
  }
}

/**
 * Shared "grime kit": service/storage filth — rats, scattered bottles, a mold
 * patch, a hanging chain and rubble. Layered on top of the structural props of
 * cellars, larders, kitchens, boiler/service rooms. Scatter counts/spreads
 * scale with the tile; big rooms also web two corners and gain a soot stain.
 */
function grimeKit(g: THREE.Group, t: RoomTheme, tile: number, seed = 1): void {
  const edge = tile / 2 - 0.55;
  g.add(rats(scaleN(4, tile), scaleSpread(1.4, tile), seed));
  placeScatter(g, bottlesAndJars(scaleN(7, tile), scaleSpread(0.5, tile), seed), edge, edge, tile, scaleSpread(0.5, tile));
  placeOnWall(g, moldPatch(0.6, seed + 3) as unknown as THREE.Object3D, "n", -edge + 0.2, 0.7, tile);
  g.add(rubblePile(scaleN(8, tile), scaleSpread(0.6, tile), t.wall, seed + 5));
  const ch = chain(0.7, 0x2a2622);
  placeOnWall(g, ch, "e", -edge * 0.4, WALL_H - 0.05, tile);
  placeFloorStain(g, "mold", 0.5, -edge * 0.5, edge * 0.5, tile, seed + 9);
  if (tile >= 6) {
    placeOnWall(g, cobwebFunnel(0.55), "s", edge, WALL_H - 0.4, tile);
    placeOnWall(g, cobwebFunnel(0.5), "w", -edge, WALL_H - 0.4, tile);
    placeFloorStain(g, "soot", 0.5, edge * 0.6, -edge * 0.4, tile, seed + 13);
    place(g, dustPile(0.16, t.floor + 0x060606) as unknown as THREE.Group, -edge, -edge * 0.6, tile);
  }
}

type Composer = (g: THREE.Group, theme: RoomTheme, tile: number, ctx: DecorCtx) => void;

const COMPOSERS: Record<string, Composer> = {
  chapel: (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the altar rises on a round dais at the room's heart; the party rings it
    if (big) {
      const dais = cyl(1.15, 1.2, 0.1, 0x4a4640, 28, { rough: 0.95 });
      dais.position.y = 0.05;
      g.add(dais);
    }
    const alt = altar(t.accent);
    if (big) alt.position.y = 0.1;
    place(g, alt, 0, big ? 0 : -(tile / 2 - 0.7), tile);
    place(g, drippingCandle(0.5, 0xe8dcc0, t.accent), -0.8, -0.8, tile);
    place(g, drippingCandle(0.5, 0xe8dcc0, t.accent), 0.8, -0.8, tile);
    if (big) {
      // pews pulled out to the perimeter, angled in toward the altar; any pew
      // that would sit in an open doorway's corridor slides down the wall
      for (const [px, pz] of [[-2.35, 0.9], [2.35, 0.9], [-2.35, -0.9], [2.35, -0.9]] as const) {
        const zz = Math.abs(pz) <= DOOR_HALF && ctx.hasDoor(px > 0 ? "e" : "w") ? Math.sign(pz) * 1.45 : pz;
        place(g, pew(), px, zz, tile, Math.atan2(-px, -zz));
      }
      hangMid(g, ctx, () => organPipes(), ["n", "w", "e", "s"], 0.9, tile, { halfW: 0.8 });
      g.add(chandelier(t.accent));
      cornerCobwebs(g, tile);
    } else {
      place(g, pew(), -0.55, 0.3, tile);
      place(g, pew(), 0.55, 0.3, tile);
      placeOnWall(g, cobwebFunnel(0.6), "e", tile / 2 - 0.6, WALL_H - 0.4, tile);
    }
    // stained glass burns on every solid wall
    const winSides = ctx.known ? ctx.walls() : (["n"] as WallSide[]);
    for (const s of winSides.slice(0, big ? 4 : 1)) {
      placeOnWall(g, glowWindow(t.accent), s, -0.9, big ? 1.9 : 1.45, tile);
      placeOnWall(g, glowWindow(t.accent), s, 0.9, big ? 1.9 : 1.45, tile);
    }
    // a fallen candelabrum and spilt holy water in the aisle
    place(g, candlestick(t.accent), tile / 2 - 0.85, tile / 2 - 0.85, tile);
    if (big) {
      const alongZ = ctx.hasDoor("n") || ctx.hasDoor("s");
      place(g, rug(alongZ ? 1.3 : tile - 1.4, alongZ ? tile - 1.4 : 1.3, 0x2b3140, t.accent), 0, 0, tile);
    }
    placeFloorStain(g, "water", 0.6, 0, tile / 2 - 1.4, tile, 11);
    placeOnWall(g, wallCrack(1.0, 3) as unknown as THREE.Object3D, "w", 0.2, 1.5, tile);
    placeOnWall(g, peelingWallpaper(0.5, 0.8, t.wall, t.floor), "w", tile / 2 - 0.7, 1.3, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, big ? 5.5 : 4.0, 2);
    light.position.set(0, 1.3, big ? 0 : -(tile / 2 - 0.7));
    g.add(light);
  },

  library: (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the reading island: a broad table, chairs tucked in, globe and candle on top
    const tbl = table(big ? 1.3 : 0.9, 0.8, 0.55);
    place(g, tbl, 0, big ? 0 : 0.9, tile, big ? 0 : -0.4);
    const gl = globe();
    if (big) gl.position.y = 0.58;
    place(g, gl, big ? 0.35 : 0.95, big ? -0.1 : 0.85, tile);
    const cd = drippingCandle(0.18, 0xe8dcc0, t.accent);
    if (big) cd.position.y = 0.58;
    place(g, cd, big ? -0.4 : 0.6, big ? 0.15 : 0.75, tile);
    place(g, chair(), 0, big ? -0.75 : 1.25, tile, big ? 0 : Math.PI);
    if (big) place(g, chair(), 0, 0.75, tile, Math.PI);
    place(g, rug(big ? 3.0 : 2.0, big ? 2.4 : 1.6, 0x5a2222, t.accent), 0, big ? 0 : 0.3, tile);
    // the stacks: a full wall of shelves, two more crowding the door walls
    const shelf1 = standAtWall(g, ctx, bookshelf(big ? 1.2 : 1.0, big ? 1.8 : 1.4, 0x3a2718), ["n", "w", "e", "s"], tile, { fromWall: 0.35 });
    const shelfWall = shelf1.side;
    if (big) {
      const s2 = wallSlot(shelfWall, -tile * 0.3, 0.35, tile);
      place(g, bookshelf(1.2, 1.8, 0x3a2718), s2.x, s2.z, tile, s2.rot);
      if (shelf1.along === 0) {
        // (skipped when the first shelf itself took the off-mid fallback slot)
        const s3 = wallSlot(shelfWall, tile * 0.3, 0.35, tile);
        place(g, bookshelf(1.2, 1.8, 0x3a2718), s3.x, s3.z, tile, s3.rot);
      }
      // two more shelves at off-mid slots on the flanking walls
      const flank: WallSide = shelfWall === "n" || shelfWall === "s" ? "w" : "n";
      const s4 = wallSlot(flank, -tile * 0.31, 0.35, tile);
      place(g, bookshelf(1.0, 1.6, 0x3a2718), s4.x, s4.z, tile, s4.rot);
      const s5 = wallSlot(flank === "w" ? "e" : "s", tile * 0.31, 0.35, tile);
      place(g, bookshelf(1.0, 1.6, 0x3a2718), s5.x, s5.z, tile, s5.rot);
      // a ladder abandoned mid-climb and a toppled stack of folios
      place(g, leaningLadder(2.6), tile / 2 - 0.75, tile / 2 - 0.95, tile, Math.PI * 0.9);
      const stackM = mat(0x5a3a22, { rough: 0.85 });
      for (let i = 0; i < 3; i++) {
        const bk = new THREE.Mesh(new THREE.BoxGeometry(0.26 - i * 0.03, 0.05, 0.2), stackM);
        bk.position.set(clampInner(-2.3, tile), 0.03 + i * 0.05, clampInner(1.9, tile));
        bk.rotation.y = i * 0.3;
        g.add(bk);
      }
      hangMid(g, ctx, () => framedPortrait(0.5, 0.65), [shelfWall === "n" ? "s" : "n", "e", "w"], 1.7, tile, { halfW: 0.3 });
      g.add(chandelier(t.accent));
      cornerCobwebs(g, tile, 3);
    } else {
      placeOnWall(g, bookshelf(1.0, 1.4, 0x3a2718), "n", 0.6, 0, tile);
      placeOnWall(g, bookshelf(1.0, 1.4, 0x3a2718), "w", -0.6, 0, tile);
      placeOnWall(g, cobwebFunnel(0.5), "e", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // toppled volumes, loose pages and creeping damp
    place(g, crate(0.3, 0x4a3422), tile / 2 - 0.7, -(tile / 2 - 0.7), tile);
    g.add(scatteredPaper(scaleFlat(9, tile), scaleSpread(1.5, tile), 31));
    placeFloorStain(g, "water", 0.5, -0.6, tile / 2 - 0.8, tile, 33);
    if (!big) placeOnWall(g, peelingWallpaper(0.5, 0.8, t.wall, t.floor), "e", tile / 2 - 0.7, 1.3, tile);
  },

  study: (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // a reading chair drawn up to the centre, side table at its elbow
      place(g, chair(0x3c2f20), 0.5, 0, tile, -Math.PI / 2 - 0.3);
      const side = table(0.4, 0.4, 0.45);
      place(g, side, -0.15, 0.35, tile);
      place(g, rug(2.4, 2.0, 0x3a2a4a, t.accent), 0, 0, tile);
      // the desk against a solid wall, the hearth against another
      const desk = standAtWall(g, ctx, table(1.6, 0.8, 0.75, 0x3c2f20), ["n", "e", "w", "s"], tile, { fromWall: 0.85 });
      const deskWall = desk.side;
      const deskSlot = wallSlot(deskWall, desk.along, 1.25, tile); // tucked in, clear of the walk ring
      place(g, chair(0x3c2f20), deskSlot.x, deskSlot.z, tile, deskSlot.rot + Math.PI);
      const gl = globe();
      gl.position.y = 0.78;
      const glSlot = wallSlot(deskWall, desk.along - 0.45, 0.85, tile);
      place(g, gl, glSlot.x, glSlot.z, tile);
      const cd = drippingCandle(0.2, 0xe8dcc0, t.accent);
      cd.position.y = 0.78;
      const cdSlot = wallSlot(deskWall, desk.along + 0.45, 0.85, tile);
      place(g, cd, cdSlot.x, cdSlot.z, tile);
      // the fireplace is this room's ONLY light source; when it must share the
      // desk's wall it slides down to an off-mid berth
      const hearthPrefer: WallSide[] = deskWall === "n" ? ["w", "e", "s", "n"] : ["n", "w", "e", "s"];
      const hearthAlong = ctx.bestWall(hearthPrefer) === deskWall ? -tile * 0.29 : 0;
      const hearth = standAtWall(g, ctx, fireplace(0xff7a2a, { light: true }), hearthPrefer, tile, { along: hearthAlong, fromWall: 0.1 });
      if (!ctx.known || ctx.bestWall([hearth.side]) === hearth.side) {
        placeOnWall(g, framedPortrait(0.5, 0.6), hearth.side, hearth.along, 2.2, tile);
      }
      // shelves and the clock ticking down someone's hours
      const s1 = wallSlot(deskWall, -tile * 0.3, 0.35, tile);
      place(g, bookshelf(0.9, 1.6), s1.x, s1.z, tile, s1.rot);
      const s2 = wallSlot(deskWall, tile * 0.3, 0.35, tile);
      place(g, bookshelf(0.9, 1.6), s2.x, s2.z, tile, s2.rot);
      place(g, grandfatherClock(), -(tile / 2 - 0.85), tile / 2 - 0.85, tile, Math.PI / 4);
      g.add(chandelier(t.accent));
      cornerCobwebs(g, tile);
    } else {
      place(g, table(1.0, 0.6, 0.55, 0x3c2f20), 0, -(tile / 2 - 0.8), tile);
      place(g, chair(0x3c2f20), 0, -(tile / 2 - 1.3), tile, Math.PI);
      place(g, globe(), -0.35, -(tile / 2 - 0.8) + 0.1, tile);
      place(g, drippingCandle(0.2, 0xe8dcc0, t.accent), 0.35, -(tile / 2 - 0.8) + 0.1, tile);
      placeOnWall(g, bookshelf(0.9, 1.3), "e", 0, 0, tile);
      placeOnWall(g, framedPortrait(0.5, 0.6), "w", 0.4, 1.4, tile);
      place(g, rug(1.6, 1.4, 0x3a2a4a, t.accent), 0, 0.4, tile);
      placeOnWall(g, cobwebFunnel(0.5), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // the journal's pages strewn about, an overturned chair and dripped ink
    place(g, brokenChair(0x3c2f20), tile / 2 - 0.7, tile / 2 - 0.7, tile, 0.5);
    g.add(scatteredPaper(scaleFlat(8, tile), scaleSpread(1.3, tile), 41));
    placeFloorStain(g, "blood", 0.4, 0.1, -(tile / 2 - 0.8) + 0.4, tile, 43);
    placeOnWall(g, wallCrack(0.9, 9) as unknown as THREE.Object3D, "s", 0.3, 1.5, tile);
  },

  kitchen: (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // the prep island: a butcher's table with a cleaver buried beside a skull
      const island = table(1.4, 0.9, 0.85, 0x5a4430);
      place(g, island, 0, 0, tile);
      const cleaverBlade = box(0.05, 0.16, 0.22, 0xb8bcc0, { metal: 0.8, rough: 0.3 });
      cleaverBlade.position.set(0.3, 0.97, 0.1);
      cleaverBlade.rotation.z = -0.25;
      g.add(cleaverBlade);
      const cleaverHaft = cyl(0.018, 0.018, 0.2, 0x3a2a1c, 6);
      cleaverHaft.position.set(0.38, 1.08, 0.1);
      cleaverHaft.rotation.z = -1.1;
      g.add(cleaverHaft);
      const sk = skull(0.9);
      sk.position.y = 0.94;
      place(g, sk, -0.35, -0.15, tile, 0.7);
      // the pot rack swings above the island
      const rackRod = cyl(0.012, 0.012, WALL_H - 2.3, 0x2a2622, 6, { metal: 0.5 });
      rackRod.position.y = (WALL_H + 2.3) / 2;
      g.add(rackRod);
      const rackRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 20), mat(0x2a2622, { metal: 0.6, rough: 0.5 }));
      rackRing.rotation.x = Math.PI / 2;
      rackRing.position.y = 2.3;
      g.add(rackRing);
      const potT = Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        return { pos: [Math.cos(a) * 0.48, 2.12, Math.sin(a) * 0.48] as [number, number, number] };
      });
      g.add(instanced(new THREE.CylinderGeometry(0.09, 0.07, 0.12, 10), mat(0x3a3632, { metal: 0.5, rough: 0.6 }), potT));
      // a long counter against a solid wall, jars huddled on top
      const counterMesh = box(2.8, 0.9, 0.6, 0x6a5236);
      counterMesh.position.y = 0.45;
      const counter = standAtWall(g, ctx, counterMesh, ["n", "w", "e", "s"], tile, { fromWall: 0.45 });
      const counterWall = counter.side;
      const jars = bottlesAndJars(8, 1.8, 83);
      jars.position.y = 0.9;
      const jarSlot = wallSlot(counterWall, counter.along, 0.45, tile);
      place(g, jars, jarSlot.x, jarSlot.z, tile);
      // the knife rack — one blade conspicuously missing
      hangMid(g, ctx, () => weaponRack(), [counterWall === "n" ? "w" : "n", "e", "s", "w"], 1.5, tile, { halfW: 0.65 });
      // five pans on hooks in a row
      const panWall = ctx.bestWall([counterWall === "n" ? "e" : "s", "w", "n"]) ?? "e";
      for (let i = 0; i < 5; i++) {
        const pan = cyl(0.12, 0.12, 0.02, 0x2e2a26, 12, { metal: 0.6, rough: 0.5 });
        pan.rotation.x = Math.PI / 2;
        placeOnWall(g, pan, panWall, -0.9 + i * 0.45, 2.2, tile);
      }
      grimeKit(g, t, tile, 80);
      placeFloorStain(g, "soot", 0.55, -1.2, 2.2, tile, 88);
    } else {
      placeOnWall(g, box(1.4, 0.85, 0.5, 0x6a5236), "n", 0, 0.425, tile);
      for (let i = 0; i < 4; i++) {
        const u = cyl(0.012, 0.012, 0.22, 0x9a9690, 6, { metal: 0.6 });
        placeOnWall(g, u, "w", -0.6 + i * 0.25, WALL_H - 0.4, tile);
      }
      place(g, bottlesAndJars(7, 0.5, 83), tile / 2 - 0.6, tile / 2 - 0.6, tile);
      placeOnWall(g, chain(0.6, 0x2a2622), "w", 0.6, WALL_H - 0.05, tile);
      placeOnWall(g, moldPatch(0.6, 87) as unknown as THREE.Object3D, "s", -0.4, 0.7, tile);
      g.add(rats(4, 1.4, 81));
    }
    // the stove smoulders in its corner
    const stove = new THREE.Group();
    const body = box(0.6, 0.7, 0.5, 0x35302c, { metal: 0.4, rough: 0.6 });
    body.position.y = 0.35;
    stove.add(body);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 10), emissiveMat(t.accent, 1.6));
    fire.position.y = 0.8;
    stove.add(fire);
    const pipe = cyl(0.06, 0.06, 1.5, 0x2a2622, 8, { metal: 0.4 });
    pipe.position.y = 1.5;
    stove.add(pipe);
    place(g, stove, tile / 2 - 0.7, -(tile / 2 - 0.7), tile);
    place(g, barrel(), -(tile / 2 - 0.6), tile / 2 - 0.6, tile);
    place(g, barrel(), -(tile / 2 - 0.6), tile / 2 - 1.1, tile);
    placeFloorStain(g, "soot", 0.5, tile / 2 - 0.7, -(tile / 2 - 0.7) + 0.5, tile, 85);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, big ? 5 : 3.5, 2);
    light.position.set(tile / 2 - 0.7, 0.9, -(tile / 2 - 0.7));
    g.add(light);
  },

  "dining-room": (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the long table dominates the island; the feast never got cleared away
    place(g, table(big ? 2.1 : 1.8, big ? 0.95 : 0.7, big ? 0.62 : 0.6, 0x4a3220), 0, 0, tile);
    if (big) place(g, rug(3.4, 2.4, 0x3a2418, t.accent), 0, 0, tile);
    const chairX = big ? 1.2 : 1.05;
    for (const z of big ? [-0.65, 0, 0.65] : [-0.55, 0.55]) {
      place(g, chair(0x4a3220), -chairX, z, tile, Math.PI / 2);
      if (!(big && z === 0)) place(g, chair(0x4a3220), chairX, z, tile, -Math.PI / 2);
    }
    const cs = candlestick(t.accent);
    if (big) cs.position.y = 0.65;
    place(g, cs, -0.4, 0, tile);
    const dc = drippingCandle(0.22, 0xe8dcc0, t.accent);
    if (big) dc.position.y = 0.65;
    place(g, dc, 0.4, 0, tile);
    if (big) {
      // four goblets abandoned mid-toast (one instanced mesh)
      const gobT = ([[-0.8, 0.2], [-0.15, -0.25], [0.55, 0.22], [0.85, -0.15]] as const).map(
        ([gx, gz]) => ({ pos: [gx, 0.69, gz] as [number, number, number] })
      );
      g.add(instanced(new THREE.CylinderGeometry(0.03, 0.02, 0.07, 8), mat(0x8a7448, { metal: 0.7, rough: 0.4 }), gobT));
      // twin chandeliers over the long table
      const ch1 = chandelier(t.accent);
      ch1.position.x = -1.2;
      g.add(ch1);
      const ch2 = chandelier(t.accent);
      ch2.position.x = 1.2;
      g.add(ch2);
      // sideboards in two corners, bottles waiting on top
      for (const sx of [-1, 1]) {
        const sb = table(1.2, 0.5, 0.5, 0x3e2a1a);
        place(g, sb, sx * (tile / 2 - 0.95), -(tile / 2 - 0.85), tile);
        const btl = bottlesAndJars(5, 0.7, 161 + sx);
        btl.position.y = 0.53;
        place(g, btl, sx * (tile / 2 - 0.95), -(tile / 2 - 0.85), tile);
      }
      // the dinner piano, lid open on a piece nobody finished
      standAtWall(g, ctx, uprightPiano(), ["w", "e", "n", "s"], tile, { along: -tile * 0.28, fromWall: 0.65 });
      cornerCobwebs(g, tile);
    } else {
      g.add(chandelier(t.accent));
      place(g, bottlesAndJars(5, 0.4, 161), 0, -0.05, tile);
      placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // a toppled chair, dust drifts, a wine-dark stain nobody scrubbed out
    place(g, brokenChair(0x4a3220), big ? 2.3 : 1.05, big ? 1.4 : 0, tile, -Math.PI / 2);
    placeFloorStain(g, "blood", 0.5, 0.6, big ? 1.6 : 0.7, tile, 163);
    place(g, dustPile(0.15, t.floor + 0x080808), -(tile / 2 - 0.7), tile / 2 - 0.7, tile);
    hangMid(g, ctx, () => framedPortrait(0.5, 0.65), ["n", "e", "w", "s"], 1.6, tile, { halfW: 0.3 });
    if (!big) placeOnWall(g, peelingWallpaper(0.5, 0.9, t.wall, t.floor), "e", tile / 2 - 0.8, 1.35, tile);
  },

  "master-bedroom": (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // the four-poster bed holds the centre of the room like a catafalque
      place(g, fourPosterBed(), 0, 0, tile);
      place(g, rug(3.0, 2.6, 0x3a2a4a, t.accent), 0, 0, tile);
      standAtWall(g, ctx, wardrobe(0x3a2a3a), ["w", "e", "n", "s"], tile, { fromWall: 0.45 });
      // the vanity: a small table under a cracked mirror, angled in a corner
      place(g, table(0.7, 0.4, 0.75), tile / 2 - 0.85, -(tile / 2 - 0.7), tile, Math.PI / 4);
      place(g, standingMirror(), tile / 2 - 0.6, -(tile / 2 - 1.2), tile, -Math.PI / 4 + Math.PI);
      place(g, crate(0.45, 0x4a3040), -(tile / 2 - 0.8), tile / 2 - 0.8, tile, 0.3);
      g.add(chandelier(t.accent));
      cornerCobwebs(g, tile);
      const curtainSides = ctx.known ? ctx.walls() : (["e"] as WallSide[]);
      for (const s of curtainSides.slice(0, 2)) {
        placeOnWall(g, tornCurtain(0.6, 1.3, 0x3a2238), s, tile * 0.28, WALL_H / 2, tile);
      }
      hangMid(g, ctx, () => framedPortrait(0.5, 0.6), ["n", "w", "e", "s"], 1.7, tile, { halfW: 0.3 });
    } else {
      place(g, bed(0.95, 1.5, 0x3a2538, 0x6a6478), 0, -(tile / 2 - 1.0), tile);
      place(g, wardrobe(0x3a2a3a), -(tile / 2 - 0.6), tile / 2 - 0.8, tile, Math.PI / 2);
      place(g, table(0.4, 0.4, 0.45), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
      place(g, drippingCandle(0.18, 0xe8dcc0, t.accent), tile / 2 - 0.6, -(tile / 2 - 0.6) + 0.05, tile);
      place(g, rug(1.6, 1.4, 0x3a2a4a, t.accent), 0, 0.6, tile);
      placeOnWall(g, framedPortrait(0.5, 0.6), "n", 0, 1.5, tile);
      placeOnWall(g, tornCurtain(0.6, 1.3, 0x3a2238), "e", 0, WALL_H / 2, tile);
      placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // dust at the bedfoot and damp staining the wall
    place(g, dustPile(0.16, t.floor + 0x080808), tile / 2 - 0.8, tile / 2 - 0.7, tile);
    placeFloorStain(g, "water", 0.5, -(tile / 2 - 0.8), -(tile / 2 - 0.8), tile, 51);
    placeOnWall(g, peelingWallpaper(0.5, 0.9, t.wall, t.floor), "s", -(tile / 2 - 0.7), 1.35, tile);
  },

  "servants-quarters": (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // three narrow cots, heads to the solid walls, a footlocker at each.
      // Distinct alongs keep them apart even when every cot lands on the one
      // solid wall this room happens to have.
      const prefers: WallSide[][] = [
        ["n", "w", "e", "s"],
        ["w", "e", "s", "n"],
        ["e", "s", "n", "w"],
      ];
      const bedAlongs = [-0.9, 0.9, -2.15];
      for (let i = 0; i < 3; i++) {
        const cot = standAtWall(g, ctx, bed(0.7, 1.3, 0x4a3424), prefers[i], tile, {
          along: bedAlongs[i],
          fromWall: 0.85,
        });
        const fSlot = wallSlot(cot.side, cot.along + 0.95, 0.75, tile);
        place(g, crate(0.3), fSlot.x, fSlot.z, tile, 0.2 * i);
      }
      // a mean little rug and a shared candle crate in the middle
      place(g, rug(1.4, 1.2, 0x4a3a28, t.accent), 0, 0, tile);
      const cr = crate(0.35);
      place(g, cr, 0.6, 0, tile, 0.4);
      const cd = drippingCandle(0.2, 0xe8dcc0, t.accent);
      cd.position.y = 0.35;
      place(g, cd, 0.6, 0, tile);
      standAtWall(g, ctx, bookshelf(0.8, 1.0, 0x4a3a28), ["s", "n", "w", "e"], tile, { along: tile * 0.3, fromWall: 0.35 });
      cornerCobwebs(g, tile, 2);
    } else {
      place(g, bed(0.7, 1.3, 0x4a3424), -(tile / 2 - 0.7), -(tile / 2 - 1.0), tile, Math.PI / 2);
      place(g, bed(0.7, 1.3, 0x4a3424), tile / 2 - 0.7, -(tile / 2 - 1.0), tile, -Math.PI / 2);
      place(g, crate(0.35), 0, tile / 2 - 0.6, tile);
      place(g, drippingCandle(0.2, 0xe8dcc0, t.accent), 0, -(tile / 2 - 0.6), tile);
      place(g, rug(1.4, 1.2, 0x4a3a28, t.accent), 0, 0.4, tile);
      placeOnWall(g, cobwebFunnel(0.5), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // a hurried departure: scattered belongings, dust and creeping mold
    g.add(scatteredPaper(scaleFlat(7, tile), scaleSpread(1.3, tile), 61));
    place(g, dustPile(0.15, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    if (big) place(g, dustPile(0.13, t.floor + 0x080808), -(tile / 2 - 0.9), -(tile / 2 - 0.8), tile);
    g.add(rats(scaleN(3, tile), scaleSpread(1.2, tile), 6));
    placeOnWall(g, moldPatch(0.6, 63) as unknown as THREE.Object3D, "n", 0, 0.8, tile);
    placeOnWall(g, wallCrack(0.9, 65) as unknown as THREE.Object3D, "e", 0.2, 1.4, tile);
  },

  "abandoned-nursery": (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the crib waits in the middle of the room; something chimes above it
    place(g, crib(0xb0a0a8), 0, big ? -0.2 : -(tile / 2 - 0.9), tile);
    if (big) {
      const mobile = hangingBirdcage();
      place(g, mobile, 0, -0.2, tile);
      place(g, rockingChair(0x5a4636), 2.4, 2.4, tile, -Math.PI / 1.3);
      standAtWall(g, ctx, wardrobe(0x4a3a44), ["w", "e", "n", "s"], tile, { fromWall: 0.45 });
      // the toy chest, spilled
      place(g, crate(0.5, 0x5a4a52), -(tile / 2 - 0.85), -(tile / 2 - 0.85), tile, 0.5);
      const toyM = mat(0x8aa0c0, { rough: 0.6 });
      const toyGeo = new THREE.SphereGeometry(0.08, 12, 10);
      for (const [bx, bz] of [[-2.0, -1.7], [-1.6, -2.3], [-2.4, -1.2]] as const) {
        const b = new THREE.Mesh(toyGeo, toyM);
        b.position.set(clampInner(bx, tile), 0.08, clampInner(bz, tile));
        g.add(b);
      }
      place(g, rug(2.2, 2.0, 0x6a5a64, t.accent), 0, 0.6, tile);
      // claw marks LOW on the wall — child-height, which is worse
      placeOnWall(g, clawMarks(0.5, 4, 75) as unknown as THREE.Object3D, "s", -tile * 0.3, 0.5, tile);
      cornerCobwebs(g, tile);
      const strand = cobwebStrand(0.9);
      strand.position.set(0.8, WALL_H - 0.3, -0.8);
      g.add(strand);
    } else {
      place(g, rockingChair(0x5a4636), tile / 2 - 0.7, tile / 2 - 0.8, tile, -Math.PI / 1.3);
      place(g, wardrobe(0x4a3a44), -(tile / 2 - 0.6), tile / 2 - 0.8, tile, Math.PI / 2);
      place(g, rug(1.6, 1.4, 0x6a5a64, t.accent), 0, 0.3, tile);
      placeOnWall(g, cobwebFunnel(0.6), "n", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // a little ball toy that still rolls sometimes
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat(t.accent, { rough: 0.6 }));
    ball.position.set(clampInner(0.4, tile), 0.1, clampInner(0.6, tile));
    g.add(ball);
    const ball2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), mat(0x8aa0c0, { rough: 0.6 }));
    ball2.position.set(clampInner(-0.5, tile), 0.08, clampInner(-0.2, tile));
    g.add(ball2);
    // unsettling neglect: a tattered curtain and a small ghost of a portrait
    placeOnWall(g, tornCurtain(0.6, 1.1, 0x6a4a58), "e", big ? tile * 0.28 : 0.3, WALL_H / 2 + 0.2, tile);
    hangMid(g, ctx, () => framedPortrait(0.4, 0.5, 0x5a4a52, 0x2a242c), ["w", "n", "e", "s"], 1.5, tile, { halfW: 0.25 });
    place(g, dustPile(0.14, t.floor + 0x080808), -(tile / 2 - 0.7), 0.3, tile);
    placeFloorStain(g, "mold", 0.45, tile / 2 - 0.8, -(tile / 2 - 0.7), tile, 71);
    placeOnWall(g, wallCrack(0.8, 73) as unknown as THREE.Object3D, "s", -0.2, 1.4, tile);
  },

  crypt: (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the sarcophagus rests on a low stone dais at the heart of the vault
    if (big) {
      const dais = box(1.1, 0.14, 1.9, 0x453f38, { rough: 0.98 });
      dais.position.y = 0.07;
      g.add(dais);
      const sarc = sarcophagus();
      sarc.position.y = 0.14;
      place(g, sarc, 0, 0, tile);
      place(g, drippingCandle(0.4, 0xe8dcc0, t.accent), -0.9, -0.9, tile);
      place(g, drippingCandle(0.4, 0xe8dcc0, t.accent), 0.9, -0.9, tile);
      // two more tombs shoulder the solid walls; a weeping figure keeps watch
      standAtWall(g, ctx, sarcophagus(0x4e4842), ["n", "w", "e", "s"], tile, { along: tile * 0.28, fromWall: 0.75, rot: Math.PI / 2 });
      standAtWall(g, ctx, sarcophagus(0x504a44), ["e", "s", "w", "n"], tile, { along: -tile * 0.28, fromWall: 0.75, rot: Math.PI / 2 });
      place(g, statue(0x6a645c), -(tile / 2 - 0.85), tile / 2 - 0.85, tile, Math.PI / 4);
      // bone niches stacked two-high on the doorless walls
      const nicheSides = ctx.known ? ctx.walls() : (["w"] as WallSide[]);
      for (const s of nicheSides.slice(0, 2)) {
        for (const y of [1.0, 1.6]) {
          placeOnWall(g, boneNiche(), s, -tile * 0.28, y, tile);
          placeOnWall(g, boneNiche(), s, tile * 0.28, y, tile);
        }
      }
      placeOnWall(g, chain(1.0, 0x2a2622), "n", -tile * 0.32, WALL_H - 0.05, tile);
      placeOnWall(g, chain(0.8, 0x2a2622), "s", tile * 0.34, WALL_H - 0.05, tile);
      placeOnWall(g, moldPatch(0.7, 15) as unknown as THREE.Object3D, "w", 0.5, 0.8, tile);
      cornerCobwebs(g, tile);
      const strand = cobwebStrand(1.0);
      strand.position.set(0, WALL_H - 0.3, -1.2);
      g.add(strand);
      place(g, bonePile(9, 0.6, 16), -(tile / 2 - 0.9), -0.4, tile);
      place(g, skull(0.9), 2.2, -1.9, tile, 1.9);
      place(g, skull(0.8), -2.4, 1.4, tile, 0.4);
      place(g, dustPile(0.15, 0x4a443c), tile / 2 - 0.8, -0.4, tile);
    } else {
      place(g, sarcophagus(), 0, 0, tile);
      place(g, boneNiche(), -(tile / 2 - 0.4), -0.6, tile, Math.PI / 2);
      place(g, boneNiche(), -(tile / 2 - 0.4), 0.6, tile, Math.PI / 2);
      place(g, drippingCandle(0.4, 0xe8dcc0, t.accent), -(tile / 2 - 0.6), -(tile / 2 - 0.6), tile);
      place(g, drippingCandle(0.4, 0xe8dcc0, t.accent), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
      placeOnWall(g, cobwebFunnel(0.6), "n", tile / 2 - 0.6, WALL_H - 0.4, tile);
    }
    place(g, candle(0.4), tile / 2 - 0.6, tile / 2 - 0.6, tile);
    // bones spilling from the ajar lid + grave dust
    place(g, bonePile(scaleN(9, tile), scaleSpread(0.5, tile), 5), tile / 2 - 0.9, tile / 2 - 1.0, tile);
    place(g, skull(1.0), 0.2, big ? 2.2 : 0.7, tile, 0.6);
    placeFloorStain(g, "blood", 0.6, 0, big ? 1.5 : 0.7, tile, 13);
    place(g, dustPile(0.16, 0x4a443c), -(tile / 2 - 0.8), -(tile / 2 - 0.9), tile);
    placeOnWall(g, wallCrack(1.1, 7) as unknown as THREE.Object3D, "e", 0, 1.4, tile);
    g.add(rats(scaleN(3, tile), scaleSpread(1.2, tile), 4));
    const light = new THREE.PointLight(t.accent, t.accentIntensity, big ? 4.5 : 3.5, 2);
    light.position.set(0, 0.9, 0);
    g.add(light);
  },

  catacomb: (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // the ossuary's centerpiece tomb, flanked by grave candles
      place(g, sarcophagus(), 0, 0, tile, Math.PI / 2);
      place(g, drippingCandle(0.35, 0xe8dcc0, t.accent), -0.9, 0.9, tile);
      place(g, drippingCandle(0.35, 0xe8dcc0, t.accent), 0.9, 0.9, tile);
      // a pillar at every corner holds up the dark
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          place(g, pillar(WALL_H, 0x5a544c), sx * (tile / 2 - 0.85), sz * (tile / 2 - 0.85), tile);
        }
      // bone heaps drift against the perimeter
      place(g, bonePile(scaleN(11, tile), scaleSpread(0.6, tile), 8), -2.5, 0.6, tile);
      place(g, bonePile(scaleN(8, tile), scaleSpread(0.5, tile), 12), 2.3, -1.6, tile);
      place(g, bonePile(9, 0.6, 18), 1.9, 2.3, tile);
      place(g, skull(1.0), -2.2, -1.9, tile, 0.3);
      place(g, skull(0.9), 2.6, 0.7, tile, 1.2);
      place(g, skull(0.85), -1.7, 2.5, tile, 2.1);
      place(g, skull(0.8), 0.6, -2.6, tile, 0.9);
      // skull niches wherever the walls are solid
      const nicheSides = ctx.known ? ctx.walls() : (["w", "e"] as WallSide[]);
      for (const s of nicheSides.slice(0, 2)) {
        placeOnWall(g, boneNiche(), s, -tile * 0.31, 0.9, tile);
        placeOnWall(g, boneNiche(), s, tile * 0.31, 0.9, tile);
      }
      cornerCobwebs(g, tile);
    } else {
      place(g, pillar(WALL_H, 0x5a544c), -(tile / 2 - 0.6), -(tile / 2 - 0.6), tile);
      place(g, pillar(WALL_H, 0x5a544c), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
      place(g, boneNiche(), -(tile / 2 - 0.4), 0.4, tile, Math.PI / 2);
      place(g, boneNiche(), tile / 2 - 0.4, 0.4, tile, -Math.PI / 2);
      place(g, boneNiche(), -(tile / 2 - 0.4), 1.1, tile, Math.PI / 2);
      place(g, sarcophagus(), 0, tile / 2 - 1.0, tile, Math.PI / 2);
      place(g, drippingCandle(0.35, 0xe8dcc0, t.accent), 0, 0, tile);
      place(g, bonePile(11, 0.6, 8), -(tile / 2 - 0.7), 0, tile);
      place(g, bonePile(8, 0.5, 12), tile / 2 - 0.7, 1.0, tile);
      place(g, skull(1.0), -0.4, -0.4, tile, 0.3);
      place(g, skull(0.9), 0.5, -0.5, tile, 1.2);
      placeOnWall(g, cobwebFunnel(0.6), "s", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    placeOnWall(g, moldPatch(0.7, 14) as unknown as THREE.Object3D, "w", 0.4, 0.8, tile);
    placeFloorStain(g, "blood", 0.5, 1.4, -1.6, tile, 141);
    place(g, dustPile(0.15, 0x4a443c), -(tile / 2 - 0.9), tile / 2 - 0.9, tile);
    if (big) place(g, dustPile(0.13, 0x4a443c), tile / 2 - 1.0, -(tile / 2 - 0.9), tile);
    g.add(rats(scaleN(4, tile), scaleSpread(1.5, tile), 6));
    const light = new THREE.PointLight(t.accent, t.accentIntensity, big ? 4.0 : 3.0, 2);
    light.position.set(0, 0.8, 0.3);
    g.add(light);
  },

  "pentagram-chamber": (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the sigil is drawn wide enough that the seance stands ON it
    g.add(pentagramDecal(t.accent, Math.min(big ? 1.5 : 1.3, tile / 2 - 0.6)));
    const ringR = Math.min(big ? 2.05 : 1.45, tile / 2 - 0.45);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      place(g, drippingCandle(0.4, 0xf2e9d0, t.accent), Math.cos(a) * ringR, Math.sin(a) * ringR, tile);
    }
    place(g, cauldron(t.accent), tile / 2 - 1.0, tile / 2 - 1.0, tile);
    if (big) {
      // the rite's lectern, its book still open to the wrong page
      place(g, lectern(), 2.3, -2.3, tile, Math.atan2(-2.3, 2.3));
      place(g, bonePile(8, 0.55, 27), 2.5, 0.9, tile);
      place(g, skull(0.9), -0.9, 2.5, tile, 1.4);
      place(g, skull(0.85), 2.1, -1.2, tile, 2.6);
      placeOnWall(g, clawMarks(0.6, 4, 29) as unknown as THREE.Object3D, "e", -tile * 0.33, 1.5, tile);
      placeOnWall(g, clawMarks(0.5, 3, 33) as unknown as THREE.Object3D, "s", tile * 0.33, 1.1, tile);
      placeOnWall(g, chain(1.1, 0x2a2226), "n", -tile * 0.34, WALL_H - 0.05, tile);
      placeOnWall(g, chain(0.9, 0x2a2226), "w", tile * 0.3, WALL_H - 0.05, tile);
      cornerCobwebs(g, tile);
      placeFloorStain(g, "blood", 0.55, 1.9, 2.0, tile, 35);
      placeFloorStain(g, "blood", 0.45, -2.2, -1.3, tile, 37);
    } else {
      placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // ritual aftermath: blood spatter, bones, scattered chants and skulls
    placeFloorStain(g, "blood", 0.7, -(tile / 2 - 0.8), tile / 2 - 0.8, tile, 17);
    placeFloorStain(g, "blood", 0.5, tile / 2 - 0.9, -(tile / 2 - 0.8), tile, 19);
    place(g, bonePile(8, 0.5, 21), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
    place(g, skull(1.1), -(tile / 2 - 0.8), tile / 2 - 0.7, tile, 0.8);
    g.add(scatteredPaper(scaleFlat(7, tile), scaleSpread(1.6, tile), 23));
    placeOnWall(g, clawMarks(0.6, 4, 25) as unknown as THREE.Object3D, "n", tile * 0.32, 1.3, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, big ? 5.5 : 4.0, 2);
    light.position.set(0, 0.6, 0);
    g.add(light);
  },

  "boiler-room": (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the boiler squats at the room's heart, pipes radiating to the walls
    const boiler = new THREE.Group();
    const drum = cyl(0.55, 0.55, 1.6, 0x4a3a2c, 18, { metal: 0.6, rough: 0.5 });
    drum.position.y = 0.8;
    boiler.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x4a3a2c, { metal: 0.6, rough: 0.5 }));
    dome.position.y = 1.6;
    boiler.add(dome);
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), emissiveMat(t.accent, 1.3));
    hatch.position.set(0, 0.6, 0.56);
    boiler.add(hatch);
    if (big) {
      boiler.scale.setScalar(1.3);
      place(g, boiler, 0, 0.2, tile);
      // three overhead feed pipes run from the dome out to the walls
      const pipeM = mat(0x6a6258, { metal: 0.7, rough: 0.4 });
      const feeds: Array<{ rot: [number, number, number]; pos: [number, number, number] }> = [
        { rot: [Math.PI / 2, 0, 0], pos: [0, 2.75, -(tile / 4)] },
        { rot: [0, 0, Math.PI / 2], pos: [-(tile / 4), 2.75, 0.2] },
        { rot: [0, 0, Math.PI / 2], pos: [tile / 4, 2.75, 0.2] },
      ];
      const feedGeo = new THREE.CylinderGeometry(0.05, 0.05, tile / 2 - 0.1, 8);
      for (const f of feeds) {
        const p = new THREE.Mesh(feedGeo, pipeM);
        p.rotation.set(f.rot[0], f.rot[1], f.rot[2]);
        p.position.set(f.pos[0], f.pos[1], f.pos[2]);
        g.add(p);
      }
      // a coal heap in the south-east, tools racked on a solid wall
      g.add((() => {
        const coal = rubblePile(scaleN(9, tile), 1.2, 0x1c1a18, 113);
        coal.position.set(2.2, 0, 2.2);
        return coal;
      })());
      hangMid(g, ctx, () => weaponRack(), ["w", "n", "s", "e"], 1.4, tile, { halfW: 0.65 });
      place(g, barrel(0x4a3a2a), -(tile / 2 - 0.7), tile / 2 - 0.7, tile);
      placeFloorStain(g, "soot", 0.6, -1.8, -1.8, tile, 119);
      placeFloorStain(g, "soot", 0.5, 1.6, -2.2, tile, 121);
    } else {
      place(g, boiler, -(tile / 2 - 0.8), -(tile / 2 - 0.8), tile);
      g.add(rubblePile(9, 0.7, 0x2a2622, 113));
    }
    // gauge pipes and valves along a solid wall
    const pipeWall = ctx.bestWall(["e", "w", "s", "n"]) ?? "e";
    for (let i = 0; i < 3; i++) {
      const pipe = cyl(0.05, 0.05, tile - 0.6, 0x6a6258, 10, { metal: 0.7, rough: 0.4 });
      pipe.rotation.z = Math.PI / 2;
      placeOnWall(g, pipe, pipeWall, 0, 0.6 + i * 0.45, tile);
    }
    const valveM = mat(0x8a8278, { metal: 0.7 });
    placeOnWall(g, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 14), valveM), pipeWall, -0.6, 1.05, tile);
    if (big) placeOnWall(g, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 14), valveM), pipeWall, 1.4, 1.5, tile);
    // industrial filth: soot, chains, rats and mold
    placeFloorStain(g, "soot", 0.7, big ? 0.9 : -(tile / 2 - 0.8), big ? 1.4 : -(tile / 2 - 0.8) + 0.7, tile, 111);
    placeOnWall(g, chain(0.8, 0x2a2622), "n", -0.7 - (big ? 1.2 : 0), WALL_H - 0.05, tile);
    placeOnWall(g, chain(0.6, 0x2a2622), "n", -0.4 - (big ? 1.2 : 0), WALL_H - 0.05, tile);
    place(g, barrel(0x4a3a2a), tile / 2 - 0.6, tile / 2 - 0.6, tile);
    g.add(rats(scaleN(3, tile), scaleSpread(1.4, tile), 115));
    placeOnWall(g, moldPatch(0.6, 117) as unknown as THREE.Object3D, "s", -0.4, 0.7, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, big ? 5.5 : 4.0, 2);
    if (big) light.position.set(0, 1.0, 0.9);
    else light.position.set(-(tile / 2 - 0.8), 0.7, -(tile / 2 - 0.8) + 0.4);
    g.add(light);
  },

  conservatory: (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // the broken fountain: a mossy figure weeping over a scummed basin
      const basin = cyl(1.1, 1.15, 0.25, 0x565e52, 24, { rough: 0.95 });
      basin.position.y = 0.125;
      g.add(basin);
      const scum = new THREE.Mesh(new THREE.CircleGeometry(1.0, 20), mat(0x22301e, { rough: 0.5 }));
      scum.rotation.x = -Math.PI / 2;
      scum.position.y = 0.26;
      g.add(scum);
      const fig = statue(0x6a7a62);
      fig.position.y = 0.1;
      fig.scale.setScalar(0.85);
      place(g, fig, 0, 0, tile, 0.8);
      // dead planting ringed around the walk, dodging the doorways
      const slots: Array<[number, number]> = [
        [-1.9, -1.7], [1.9, -1.7], [-2.5, 0.4], [2.5, 0.4], [-1.7, 2.1], [1.7, 2.1], [0.4, -2.6], [-0.4, 2.6],
      ];
      let planted = 0;
      for (const [px, pz] of slots) {
        if (planted >= 6) break;
        if (inDoorCorridor(ctx, px, pz, 0.2)) continue;
        place(g, deadPlant(), px, pz, tile);
        planted++;
      }
      place(g, hangingBirdcage(), tile / 2 - 1.0, tile / 2 - 1.0, tile);
    } else {
      place(g, deadPlant(), -(tile / 2 - 0.6), -(tile / 2 - 0.6), tile);
      place(g, deadPlant(), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
      place(g, deadPlant(), -(tile / 2 - 0.6), tile / 2 - 0.6, tile);
      place(g, deadPlant(), tile / 2 - 0.6, tile / 2 - 0.6, tile);
      place(g, deadPlant(), 0, -(tile / 2 - 0.6), tile);
    }
    // benches for contemplating the rot
    const mkBench = () => {
      const bench = new THREE.Group();
      const seat = box(1.0, 0.05, 0.3, 0x4a4a3a);
      seat.position.y = 0.4;
      bench.add(seat);
      for (const sx of [-1, 1]) {
        const leg = box(0.06, 0.4, 0.28, 0x3a3a2a);
        leg.position.set(sx * 0.4, 0.2, 0);
        bench.add(leg);
      }
      return bench;
    };
    place(g, mkBench(), big ? -2.4 : 0, tile / 2 - 0.7, tile, Math.PI);
    if (big) place(g, mkBench(), 2.4, -(tile / 2 - 0.7), tile, 0.2);
    // the glass wall glows with moonlight through grime
    const winWall = ctx.bestWall(["n", "w", "e", "s"]) ?? "n";
    placeOnWall(g, glowWindow(t.accent), winWall, 0, big ? 1.7 : 1.45, tile);
    if (big) {
      placeOnWall(g, glowWindow(t.accent), winWall, -tile * 0.3, 1.7, tile);
      placeOnWall(g, glowWindow(t.accent), winWall, tile * 0.3, 1.7, tile);
      // creepers rake the walls where the glass gave way
      placeOnWall(g, clawMarks(0.7, 5, 129) as unknown as THREE.Object3D, "e", -tile * 0.3, 2.2, tile);
      placeOnWall(g, clawMarks(0.6, 4, 131) as unknown as THREE.Object3D, "s", tile * 0.3, 2.4, tile);
      cornerCobwebs(g, tile, 3);
      // spilt soil from toppled pots
      place(g, dustPile(0.16, 0x2a2018), -2.3, -0.9, tile);
      place(g, dustPile(0.14, 0x2a2018), 2.2, 1.4, tile);
      place(g, dustPile(0.13, 0x2a2018), -0.9, 2.4, tile);
      placeFloorStain(g, "mold", 0.55, 1.8, -2.0, tile, 133);
    } else {
      placeOnWall(g, cobwebFunnel(0.6), "e", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // overgrown ruin: broken glass under the window, mold on the stone
    g.add(glassShards(scaleFlat(10, tile), scaleSpread(1.2, tile), 121));
    placeFloorStain(g, "mold", 0.6, -0.5, big ? 2.2 : 0.5, tile, 123);
    placeOnWall(g, moldPatch(0.7, 125) as unknown as THREE.Object3D, "w", 0, 0.9, tile);
    placeOnWall(g, wallCrack(1.0, 127) as unknown as THREE.Object3D, "s", 0.3, 1.4, tile);
  },

  vault: (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the vault door hangs on a SOLID wall (never blocking a doorway)
    hangMid(g, ctx, () => vaultDoor(), ["n", "e", "w", "s"], 0, tile, { halfW: 0.75 });
    if (big) {
      // the hoard heaped at the room's centre around a gold-strapped strongbox
      place(g, goldPile(), 0.5, 0.35, tile);
      place(g, goldPile(), -0.45, 0.5, tile);
      place(g, goldPile(), 0.1, -0.55, tile);
      const strongbox = crate(0.45, 0x3a3a3c);
      const trimM = mat(0xffd24d, { metal: 0.9, rough: 0.25 });
      for (const ty of [0.12, 0.34]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.05, 0.47), trimM);
        strap.position.y = ty;
        strongbox.add(strap);
      }
      place(g, strongbox, -0.35, -0.4, tile, 0.4);
      place(g, goldPile(), -(tile / 2 - 0.85), tile / 2 - 0.85, tile);
      place(g, goldPile(), tile / 2 - 0.85, tile / 2 - 0.85, tile);
      place(g, crate(0.4, 0x5a4a2c), tile / 2 - 0.8, -(tile / 2 - 0.8), tile);
      place(g, crate(0.34, 0x5a4a2c), tile / 2 - 1.3, -(tile / 2 - 0.75), tile, 0.5);
      // loose coins glint far from the heap — someone got partway to the door
      const loose1 = goldPile();
      loose1.scale.setScalar(0.6);
      place(g, loose1, -2.2, 0.9, tile);
      const loose2 = goldPile();
      loose2.scale.setScalar(0.5);
      place(g, loose2, 1.8, 2.3, tile);
      cornerCobwebs(g, tile, 2);
    } else {
      place(g, goldPile(), -(tile / 2 - 0.7), tile / 2 - 0.7, tile);
      place(g, goldPile(), tile / 2 - 0.7, tile / 2 - 0.7, tile);
      place(g, goldPile(), 0, tile / 2 - 0.6, tile);
      place(g, crate(0.4, 0x5a4a2c), tile / 2 - 0.7, -(tile / 2 - 0.7), tile);
      placeOnWall(g, cobwebFunnel(0.5), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // someone (or something) tried to break in: the door wall is claw-raked
    const doorWall = ctx.bestWall(["n", "e", "w", "s"]) ?? "n";
    placeOnWall(g, clawMarks(0.7, 4, 131) as unknown as THREE.Object3D, doorWall, -1.0, 1.0, tile);
    placeOnWall(g, clawMarks(0.6, 3, 133) as unknown as THREE.Object3D, doorWall, 1.0, 0.8, tile);
    place(g, bonePile(scaleN(6, tile), scaleSpread(0.4, tile), 135), -(tile / 2 - 0.8), -(tile / 2 - 0.8), tile);
    placeOnWall(g, chain(0.7, 0x3a342c), "e", -tile * 0.3, WALL_H - 0.05, tile);
    if (big) placeOnWall(g, chain(0.9, 0x3a342c), "w", tile * 0.28, WALL_H - 0.05, tile);
    placeFloorStain(g, "blood", 0.45, 0, big ? -1.6 : -0.2, tile, 137);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, big ? 4.5 : 3.0, 2);
    light.position.set(0, 0.5, big ? 0.4 : tile / 2 - 0.7);
    g.add(light);
  },

  gymnasium: (g, _t, tile, ctx) => {
    const big = tile >= 6;
    // the vaulting horse stands centre-floor, skewed as if shoved
    const horse = new THREE.Group();
    const body = box(0.9, 0.3, 0.4, 0x6a4a32);
    body.position.y = 0.95;
    horse.add(body);
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const leg = box(0.06, 0.8, 0.06, 0x3a2a1c);
      leg.position.set(sx * 0.35, 0.4, sz * 0.13);
      horse.add(leg);
    }
    place(g, horse, 0, big ? 0 : -(tile / 2 - 0.9), tile, big ? 0.3 : 0);
    // weight plates abandoned near a solid wall
    const plateWall = ctx.bestWall(["s", "w", "e", "n"]) ?? "s";
    const plateSlot = wallSlot(plateWall, big ? -1.6 : -0.4, 0.7, tile);
    const plateT = Array.from({ length: big ? 4 : 3 }, (_, i) => ({
      pos: [plateSlot.x + i * 0.3 * (plateWall === "e" || plateWall === "w" ? 0 : 1), 0.16, plateSlot.z + i * 0.3 * (plateWall === "e" || plateWall === "w" ? 1 : 0)] as [number, number, number],
      rot: [0, 0, Math.PI / 2] as [number, number, number],
    }));
    g.add(instanced(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), mat(0x2a2a2c, { metal: 0.6, rough: 0.5 }), plateT));
    if (big) {
      // fencing rack (blades missing), a bench, and a climbing rope to nowhere
      hangMid(g, ctx, () => weaponRack(), ["n", "w", "e", "s"], 1.4, tile, { halfW: 0.65 });
      standAtWall(g, ctx, pew(0x54442e), ["e", "w", "s", "n"], tile, { along: tile * 0.28, fromWall: 0.55 });
      const rope = cyl(0.02, 0.02, WALL_H - 0.4, 0x6a5a42, 6, { rough: 1 });
      rope.position.y = (WALL_H - 0.4) / 2 + 0.4;
      place(g, rope, 2.3, -2.3, tile);
      // a punching bag still swaying on its ceiling chain, split at the seam
      const bag = new THREE.Group();
      const bagChain = chain(1.0, 0x2a2622);
      bagChain.position.y = WALL_H - 0.05;
      bag.add(bagChain);
      const bagBody = cyl(0.19, 0.16, 0.9, 0x4a2620, 12, { rough: 0.7 });
      bagBody.position.y = WALL_H - 0.05 - 0.85 - 0.45;
      bagBody.rotation.z = 0.06;
      bag.add(bagBody);
      place(g, bag, -2.2, 1.8, tile, 0.4);
      // medicine balls rolled to the perimeter; a dumbbell dropped mid-set
      g.add(
        instanced(new THREE.SphereGeometry(0.15, 10, 8), mat(0x4a3a2c, { rough: 0.95 }), [
          { pos: [2.45, 0.15, 1.45] },
          { pos: [2.75, 0.13, 1.85], scale: 0.85 },
          { pos: [-2.5, 0.14, -1.6], scale: 0.9 },
        ])
      );
      const dumbbell = new THREE.Group();
      const dbBar = cyl(0.025, 0.025, 0.5, 0x8a8278, 8, { metal: 0.7, rough: 0.4 });
      dbBar.rotation.z = Math.PI / 2;
      dbBar.position.y = 0.09;
      dumbbell.add(dbBar);
      for (const sx of [-1, 1]) {
        const end = cyl(0.09, 0.09, 0.08, 0x2a2a2c, 12, { metal: 0.6, rough: 0.5 });
        end.rotation.z = Math.PI / 2;
        end.position.set(sx * 0.21, 0.09, 0);
        dumbbell.add(end);
      }
      place(g, dumbbell, -2.4, 1.5, tile, 0.7);
      cornerCobwebs(g, tile, 3);
    } else {
      placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // wall bars — a ladder of rungs bolted to a solid wall
    const barWall = ctx.bestWall(["e", "s", "w", "n"]) ?? "e";
    const wallBars = new THREE.Group();
    for (const sx of [-1, 1]) {
      const stile = box(0.07, 2.0, 0.06, 0x6a5a42, { rough: 0.9 });
      stile.position.set(sx * (big ? 1.1 : 0.65), 0, 0.05);
      wallBars.add(stile);
    }
    wallBars.add(
      instanced(
        new THREE.CylinderGeometry(0.035, 0.035, big ? 2.2 : 1.3, 8),
        mat(0x8a8278, { metal: 0.6, rough: 0.5 }),
        [-0.75, -0.25, 0.25, 0.75].map((y) => ({
          pos: [0, y, 0.08] as [number, number, number],
          rot: [0, 0, Math.PI / 2] as [number, number, number],
        }))
      )
    );
    placeOnWall(g, wallBars, barWall, 0, 1.25, tile);
    // a torn exercise chart flaking off the plaster beside the bars
    hangMid(g, ctx, () => peelingWallpaper(0.55, 0.75, 0xcac0a4, 0x6a6052), ["s", "w", "n", "e"], 1.6, tile, {
      along: big ? -1.9 : -1.3,
      halfW: 0.3,
    });
    // rot and those handprints far too high up the wall
    placeOnWall(g, clawMarks(0.5, 5, 141) as unknown as THREE.Object3D, "n", -0.3 - (big ? 1.4 : 0), big ? 2.6 : 2.0, tile);
    placeOnWall(g, clawMarks(0.5, 5, 143) as unknown as THREE.Object3D, "n", 0.4 + (big ? 1.4 : 0), big ? 2.8 : 2.1, tile);
    if (big) placeOnWall(g, clawMarks(0.45, 4, 149) as unknown as THREE.Object3D, "e", tile * 0.3, 2.7, tile);
    place(g, brokenChair(0x5a4636), -(tile / 2 - 0.7), tile / 2 - 0.7, tile, 0.8);
    g.add(debrisPlank(scaleFlat(6, tile), scaleSpread(1.3, tile), 0x4a3a2a, 145));
    placeFloorStain(g, "mold", 0.6, big ? 2.2 : 0.5, big ? 0.6 : 0.4, tile, 147);
    place(g, dustPile(0.15, 0x4a4238), -(tile / 2 - 0.8), -(tile / 2 - 0.9), tile);
    placeOnWall(g, wallCrack(1.0, 151) as unknown as THREE.Object3D, "w", 0.3, 1.6, tile);
  },

  attic: (g, _t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // furniture sleeping under a dust sheet — the shape is almost familiar
      const sheet = box(1.2, 0.9, 0.8, 0xd8d4c8, { rough: 1 });
      sheet.position.y = 0.45;
      place(g, sheet as unknown as THREE.Group, 0, 0, tile, 0.15);
      // stacked crates, barrels and the mirror no one will look into
      place(g, crate(0.45), -(tile / 2 - 0.85), -(tile / 2 - 0.85), tile);
      const stack1 = crate(0.34);
      stack1.position.y = 0.45;
      place(g, stack1, -(tile / 2 - 0.85), -(tile / 2 - 0.85), tile, 0.4);
      place(g, crate(0.42), tile / 2 - 0.85, tile / 2 - 0.85, tile, 0.2);
      const stack2 = crate(0.3);
      stack2.position.y = 0.42;
      place(g, stack2, tile / 2 - 0.85, tile / 2 - 0.85, tile, 0.7);
      place(g, crate(0.4), -2.4, 1.9, tile, 0.9);
      place(g, barrel(), tile / 2 - 0.6, 0.6, tile);
      place(g, barrel(), tile / 2 - 1.1, 0.4, tile);
      place(g, rockingChair(0x5a4636), 2.3, -2.2, tile, -Math.PI / 1.4);
      place(g, standingMirror(), -2.5, 0.4, tile, Math.PI / 2 + 0.2);
      standAtWall(g, ctx, wardrobe(0x4a3a30), ["n", "w", "e", "s"], tile, { along: -tile * 0.28, fromWall: 0.45 });
      // claw marks HIGH under the roof — whatever made them can climb
      placeOnWall(g, clawMarks(0.6, 5, 157) as unknown as THREE.Object3D, "n", tile * 0.3, 2.6, tile);
      placeOnWall(g, clawMarks(0.5, 4, 159) as unknown as THREE.Object3D, "e", -tile * 0.28, 2.8, tile);
      // more furniture sleeping under sheets, and keepsakes spilt from a trunk
      const tallSheet = box(0.55, 1.6, 0.5, 0xd8d4c8, { rough: 1 });
      tallSheet.position.y = 0.8;
      place(g, tallSheet, 2.4, 1.6, tile, -0.2);
      placeScatter(g, bottlesAndJars(scaleN(5, tile), 0.6, 163), -2.3, 1.4, tile, 0.6);
    } else {
      place(g, crate(0.45), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
      place(g, crate(0.35), -(tile / 2 - 0.55), -(tile / 2 - 1.2), tile);
      place(g, crate(0.4), tile / 2 - 0.7, tile / 2 - 0.7, tile);
      place(g, rockingChair(0x5a4636), tile / 2 - 0.7, -(tile / 2 - 0.9), tile, -Math.PI / 1.4);
      place(g, barrel(), tile / 2 - 0.6, 0.2, tile);
    }
    // rafters across the ceiling — trim-tagged so they fade with the walls
    const rafterZ = big ? [-2.4, -1.2, 0, 1.2, 2.4] : [-0.9, 0, 0.9];
    const rafterT = rafterZ.map((z) => ({ pos: [0, WALL_H - 0.15, z] as [number, number, number] }));
    g.add(tagXrayTrim(instanced(new THREE.BoxGeometry(tile - 0.4, 0.1, 0.12), trimWood(0x3a2a1c), rafterT)));
    // cobwebs in the corners and strands drooping between the rafters
    if (big) {
      cornerCobwebs(g, tile);
      for (const [sx, sz] of [[-1.1, -1.8], [0.9, 0.6], [-0.4, 1.8]] as const) {
        const strand = cobwebStrand(1.1);
        strand.position.set(sx, WALL_H - 0.22, sz);
        g.add(strand);
      }
    } else {
      placeOnWall(g, cobwebFunnel(0.7), "n", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
      placeOnWall(g, cobwebFunnel(0.6), "s", tile / 2 - 0.6, WALL_H - 0.4, tile);
      const strand = cobwebStrand(0.9);
      strand.position.set(0, WALL_H - 0.25, 0);
      g.add(strand);
    }
    // a round-topped gable window lets the moon in — pale light, not candle-warm
    hangMid(g, ctx, () => glowWindow(0xa8c0e0), ["n", "s", "e", "w"], big ? 2.2 : 1.9, tile, { halfW: 0.4 });
    // forgotten junk under the rafters: a sheeted portrait, debris and dust
    hangMid(g, ctx, () => framedPortrait(0.5, 0.6), ["w", "s", "n", "e"], 1.4, tile, { halfW: 0.3 });
    g.add(debrisPlank(scaleFlat(6, tile), scaleSpread(1.6, tile), 0x3a2a1c, 151));
    place(g, dustPile(0.18, 0x4a4238), 0, tile / 2 - 0.7, tile);
    place(g, dustPile(0.14, 0x4a4238), -(tile / 2 - 0.7), 0.4, tile);
    if (big) {
      place(g, dustPile(0.16, 0x4a4238), 1.9, 1.2, tile);
      place(g, dustPile(0.13, 0x4a4238), -1.4, -2.3, tile);
      g.add(scatteredPaper(8, 2.2, 161));
    }
    g.add(rats(scaleN(3, tile), scaleSpread(1.4, tile), 153));
    placeFloorStain(g, "water", 0.5, 0.5, big ? -2.2 : -0.5, tile, 155);
  },

  "entrance-hall": (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the runner follows the door axis; a warding statue greets all comers
    const alongZ = ctx.hasDoor("n") || ctx.hasDoor("s") || !ctx.known;
    place(g, rug(alongZ ? (big ? 1.6 : 1.2) : tile - 1.6, alongZ ? tile - 1.6 : (big ? 1.6 : 1.2), 0x5a2424, t.accent), 0, 0, tile);
    if (big) {
      place(g, statue(), 0, 0, tile, Math.PI);
      // pillars at all four corners hold up the entrance's pretensions
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          place(g, pillar(WALL_H, 0x6a6258), sx * (tile / 2 - 0.6), sz * (tile / 2 - 0.6), tile);
        }
      // console table with a guttering candle against a solid wall; a pew for
      // guests who never left
      const console_ = standAtWall(g, ctx, table(0.9, 0.35, 0.75), ["n", "e", "w", "s"], tile, { fromWall: 0.55 });
      const cd = drippingCandle(0.22, 0xe8dcc0, t.accent);
      cd.position.y = 0.78;
      const cdSlot = wallSlot(console_.side, console_.along + 0.15, 0.55, tile);
      place(g, cd, cdSlot.x, cdSlot.z, tile);
      standAtWall(g, ctx, pew(0x4e3a26), [console_.side === "w" ? "e" : "w", "s", "n", "e"], tile, { along: tile * 0.28, fromWall: 0.5 });
      dressWalls(g, ctx, tile, t.accent);
      g.add(chandelier(t.accent));
      cornerCobwebs(g, tile);
      place(g, dustPile(0.15, t.floor + 0x080808), -(tile / 2 - 0.9), -(tile / 2 - 0.8), tile);
    } else {
      place(g, pillar(WALL_H, 0x6a6258), -(tile / 2 - 0.5), -(tile / 2 - 0.5), tile);
      place(g, pillar(WALL_H, 0x6a6258), tile / 2 - 0.5, -(tile / 2 - 0.5), tile);
      place(g, table(0.7, 0.35, 0.55), 0, -(tile / 2 - 0.6), tile);
      place(g, drippingCandle(0.22, 0xe8dcc0, t.accent), 0, -(tile / 2 - 0.6) + 0.05, tile);
      placeOnWall(g, framedPortrait(0.6, 0.8), "n", 0, 1.6, tile);
      placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
      placeOnWall(g, cobwebFunnel(0.6), "e", tile / 2 - 0.6, WALL_H - 0.4, tile);
    }
    // grand decay: leaves and dust blown in, a creeping stain
    g.add(scatteredPaper(scaleFlat(6, tile), scaleSpread(1.4, tile), 181));
    place(g, dustPile(0.18, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    placeFloorStain(g, "water", 0.6, -(tile / 2 - 0.8), tile / 2 - 0.8, tile, 183);
    placeOnWall(g, peelingWallpaper(0.5, 0.9, t.wall, t.floor), "s", tile / 2 - 0.7, 1.35, tile);
  },

  foyer: (g, t, tile, ctx) => {
    const big = tile >= 6;
    // a candlelit table holds the centre under the chandelier
    place(g, rug(big ? 2.6 : 1.4, big ? 2.6 : 1.4, 0x4a2a4a, t.accent), 0, 0, tile);
    if (big) {
      place(g, table(0.9, 0.9, 0.55), 0, 0, tile);
      const cs = candlestick(t.accent);
      cs.position.y = 0.58;
      place(g, cs, 0, 0, tile);
      // all four sides usually open here — furnishing keeps to the corners
      place(g, grandfatherClock(), -(tile / 2 - 0.85), -(tile / 2 - 0.85), tile, Math.PI / 4);
      place(g, statue(0x7e786c), tile / 2 - 0.85, -(tile / 2 - 0.85), tile, -Math.PI / 4);
      place(g, deadPlant(), -(tile / 2 - 0.75), tile / 2 - 0.75, tile);
      place(g, table(0.6, 0.4, 0.55), tile / 2 - 0.9, tile / 2 - 0.9, tile, Math.PI / 4);
      const cd = drippingCandle(0.22, 0xe8dcc0, t.accent);
      cd.position.y = 0.58;
      place(g, cd, tile / 2 - 0.9, tile / 2 - 0.9, tile);
      cornerCobwebs(g, tile);
      placeOnWall(g, tornCurtain(0.6, 1.2, 0x3a2a4a), "n", tile * 0.31, WALL_H / 2 + 0.1, tile);
    } else {
      place(g, table(0.6, 0.4, 0.55), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
      place(g, drippingCandle(0.22, 0xe8dcc0, t.accent), -(tile / 2 - 0.7), -(tile / 2 - 0.7) + 0.05, tile);
      placeOnWall(g, framedPortrait(0.5, 0.65), "e", 0, 1.5, tile);
      placeOnWall(g, framedPortrait(0.5, 0.65), "w", 0, 1.5, tile);
      placeOnWall(g, tornCurtain(0.6, 1.2, 0x3a2a4a), "n", 0.5, WALL_H / 2 + 0.1, tile);
      placeOnWall(g, cobwebFunnel(0.6), "s", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    g.add(chandelier(t.accent));
    // mildewed grandeur: dust, scattered paper, a creeping stain
    place(g, dustPile(0.16, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    g.add(scatteredPaper(scaleFlat(6, tile), scaleSpread(1.3, tile), 191));
    placeFloorStain(g, "mold", 0.5, 0.6, big ? -1.6 : -0.6, tile, 193);
    placeOnWall(g, wallCrack(1.0, 195) as unknown as THREE.Object3D, "n", -tile * 0.3, 1.5, tile);
  },

  "grand-staircase": (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // the staircase sweeps up the north half — the room's whole reason to be
      const stairs = staircase();
      stairs.scale.setScalar(1.5);
      place(g, stairs, 0, -1.9, tile);
      const newelL = candlestick(t.accent);
      place(g, newelL, -1.2, -0.7, tile);
      const newelR = candlestick(t.accent);
      place(g, newelR, 1.2, -0.7, tile);
      place(g, statue(0x7e786c), -(tile / 2 - 0.85), tile / 2 - 0.85, tile, Math.PI / 4);
      // portraits climb the west wall alongside the stairs
      placeOnWall(g, framedPortrait(0.5, 0.65), "w", -1.4, 1.4, tile);
      placeOnWall(g, framedPortrait(0.5, 0.65), "w", 0, 1.8, tile);
      placeOnWall(g, framedPortrait(0.5, 0.65), "w", 1.4, 2.2, tile);
      placeOnWall(g, sconce(t.accent), "e", -1.6, 1.7, tile);
      placeOnWall(g, sconce(t.accent), "e", 1.6, 1.7, tile);
      g.add(chandelier(t.accent));
      cornerCobwebs(g, tile, 3);
      place(g, rug(1.4, 3.0, 0x5a2424, t.accent), 0, 1.6, tile);
    } else {
      place(g, staircase(), 0, 0.2, tile);
      placeOnWall(g, framedPortrait(0.5, 0.65), "w", 0.4, 1.6, tile);
      placeOnWall(g, sconce(t.accent), "e", -0.4, 1.5, tile);
      placeOnWall(g, sconce(t.accent), "e", 0.4, 1.5, tile);
      place(g, rug(1.0, 1.2, 0x5a2424, t.accent), 0, tile / 2 - 0.8, tile);
      placeOnWall(g, cobwebFunnel(0.7), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // splintered banister, fallen portraits and cobwebbed corners
    g.add(debrisPlank(scaleFlat(6, tile), scaleSpread(1.1, tile), 0x3a2a18, 201));
    placeOnWall(g, framedPortrait(0.4, 0.5, 0x4a3826, 0x241f26), "w", -(big ? 2.4 : 0.5), 1.0, tile);
    place(g, dustPile(0.16, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    placeFloorStain(g, "water", 0.5, -(tile / 2 - 0.8), tile / 2 - 0.8, tile, 203);
    placeOnWall(g, wallCrack(1.1, 205) as unknown as THREE.Object3D, "e", -0.5, 1.6, tile);
  },

  "portrait-gallery": (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the family's eyes line the best solid wall
    const wallP = ctx.bestWall(["n", "s", "w", "e"]) ?? "n";
    if (big) {
      for (const a of [-2.1, -0.7, 0.7, 2.1]) placeOnWall(g, framedPortrait(0.5, 0.65), wallP, a, 1.7, tile);
      for (const a of [-1.4, 0, 1.4]) placeOnWall(g, sconce(t.accent), wallP, a, 1.6, tile);
      // a pew faces the portraits, as if someone sat vigil here
      const pw = pew(0x4e3a26);
      const faceRot = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[wallP];
      place(g, pw, wallP === "e" ? 0.9 : wallP === "w" ? -0.9 : 0, wallP === "n" ? -0.9 : wallP === "s" ? 0.9 : 0, tile, faceRot);
      // statues keep the far corners
      place(g, statue(0x7e786c), -(tile / 2 - 0.85), tile / 2 - 0.85, tile, Math.PI / 4);
      place(g, statue(0x746e62), tile / 2 - 0.85, tile / 2 - 0.85, tile, -Math.PI / 4);
      const opp: WallSide = wallP === "n" ? "s" : wallP === "s" ? "n" : wallP === "e" ? "w" : "e";
      if (!ctx.hasDoor(opp)) {
        placeOnWall(g, framedPortrait(0.5, 0.65, 0x5a4326, 0x322838), opp, -1.4, 1.7, tile);
        placeOnWall(g, framedPortrait(0.5, 0.65, 0x5a4326, 0x322838), opp, 1.4, 1.7, tile);
      }
      cornerCobwebs(g, tile, 3);
      // the runner walks the length of the portrait wall
      const horiz = wallP === "n" || wallP === "s";
      const rSlot = wallSlot(wallP, 0, 1.6, tile);
      place(g, rug(horiz ? tile - 1.6 : 1.1, horiz ? 1.1 : tile - 1.6, 0x4a3320, t.accent), rSlot.x, rSlot.z, tile);
    } else {
      placeOnWall(g, framedPortrait(0.5, 0.65), "n", -0.7, 1.5, tile);
      placeOnWall(g, framedPortrait(0.5, 0.65), "n", 0.0, 1.5, tile);
      placeOnWall(g, framedPortrait(0.5, 0.65), "n", 0.7, 1.5, tile);
      placeOnWall(g, framedPortrait(0.5, 0.65, 0x5a4326, 0x322838), "s", -0.7, 1.5, tile);
      placeOnWall(g, framedPortrait(0.5, 0.65, 0x5a4326, 0x322838), "s", 0.7, 1.5, tile);
      placeOnWall(g, sconce(t.accent), "w", -0.5, 1.5, tile);
      placeOnWall(g, sconce(t.accent), "w", 0.5, 1.5, tile);
      place(g, rug(0.9, tile - 0.8, 0x4a3320, t.accent), 0, 0, tile);
      placeOnWall(g, cobwebFunnel(0.6), "e", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // one portrait has fallen and shattered; its frame lies cracked on the floor
    const fallen = framedPortrait(0.4, 0.5, 0x4a3826, 0x241f26);
    fallen.rotation.x = -Math.PI / 2 + 0.15;
    fallen.position.y = 0.05;
    place(g, fallen, -(tile / 2 - 0.85), tile / 2 - 1.6, tile, 0.6);
    g.add(glassShards(scaleFlat(8, tile), scaleSpread(1.0, tile), 211));
    placeFloorStain(g, "water", 0.5, tile / 2 - 0.8, -0.5, tile, 213);
    placeOnWall(g, wallCrack(0.9, 215) as unknown as THREE.Object3D, wallP, -tile * 0.34, 1.0, tile);
  },

  larder: (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // the butcher's block, jars of something waiting on top
      const block = table(1.0, 0.7, 0.8, 0x54402c);
      place(g, block, 0, 0, tile);
      const topJars = bottlesAndJars(6, 0.6, 93);
      topJars.position.y = 0.83;
      place(g, topJars, 0, 0, tile);
      // pantry shelves along every solid wall (distinct alongs so they still
      // spread out when they all fall back to the same wall)
      const prefers: WallSide[][] = [
        ["n", "w", "e", "s"],
        ["w", "e", "s", "n"],
        ["e", "s", "n", "w"],
      ];
      const shelfAlongs = [tile * 0.29, -tile * 0.29, 0];
      for (let i = 0; i < 3; i++) {
        standAtWall(g, ctx, bookshelf(0.9, 1.5, 0x4a3422), prefers[i], tile, { along: shelfAlongs[i], fromWall: 0.35 });
      }
      place(g, barrel(), -(tile / 2 - 0.7), tile / 2 - 0.7, tile);
      place(g, barrel(), -(tile / 2 - 0.7), tile / 2 - 1.25, tile);
      place(g, barrel(), tile / 2 - 0.7, tile / 2 - 0.7, tile);
      place(g, crate(0.35), tile / 2 - 0.8, -(tile / 2 - 0.8), tile, 0.3);
      place(g, crate(0.3), -2.4, -2.2, tile, 0.8);
      // the specimen shelf: five unlabeled jars, faintly luminous
      hangMid(g, ctx, () => specimenShelf(0x86c46a), ["e", "w", "n", "s"], 1.3, tile, { halfW: 0.55 });
    } else {
      placeOnWall(g, bookshelf(0.9, 1.3, 0x4a3422), "n", -0.55, 0, tile);
      placeOnWall(g, bookshelf(0.9, 1.3, 0x4a3422), "n", 0.55, 0, tile);
      place(g, barrel(), -(tile / 2 - 0.6), tile / 2 - 0.6, tile);
      place(g, barrel(), tile / 2 - 0.6, tile / 2 - 0.6, tile);
      place(g, crate(0.35), 0, tile / 2 - 0.6, tile);
      placeOnWall(g, cobwebFunnel(0.5), "e", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // hanging meats nobody has dared to date
    const meats = big ? 5 : 3;
    for (let i = 0; i < meats; i++) {
      const m = cyl(0.05, 0.04, 0.3, 0x6a3a2a, 8, { rough: 0.8 });
      placeOnWall(g, m, "w", -0.5 - (big ? 0.5 : 0) + i * 0.4, WALL_H - 0.5, tile);
    }
    // dark unlabeled jars (the flavor) + shared grime kit (rats, mold, chains)
    placeScatter(g, bottlesAndJars(scaleN(8, tile), scaleSpread(0.55, tile), 91), -(tile / 2 - 0.6), -(tile / 2 - 0.7), tile, scaleSpread(0.55, tile));
    grimeKit(g, t, tile, 90);
  },

  "cold-cellar": (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // a row of barrels shoulders the best solid wall (when no wall is known
      // solid, only the two off-mid barrels stay so no doorway gets blocked)
      const rowWall = ctx.bestWall(["w", "n", "e", "s"]);
      for (const a of rowWall ? [-1.8, -0.6, 0.6, 1.8] : [-1.8, 1.8]) {
        const slot = wallSlot(rowWall ?? "w", a, 0.65, tile);
        place(g, barrel(), slot.x, slot.z, tile);
      }
      // a crate stack in the far corner and strays elsewhere
      place(g, crate(0.45), 2.4, 2.4, tile, 0.2);
      const topCrate = crate(0.32);
      topCrate.position.y = 0.45;
      place(g, topCrate, 2.4, 2.4, tile, 0.6);
      place(g, crate(0.4), -(tile / 2 - 0.8), tile / 2 - 0.8, tile);
      place(g, crate(0.3), tile / 2 - 0.8, -(tile / 2 - 0.8), tile, 0.4);
      // the puddle that never dries sits where the tokens won't stand
      place(g, floorPuddle(0.7, 0x141c20), 0.8, 0.6, tile);
      place(g, floorPuddle(0.4, 0x141c20), -2.2, -1.4, tile);
      place(g, floorPuddle(0.32, 0x141c20), 1.6, -2.3, tile);
      placeOnWall(g, chain(1.0, 0x2a2622), "e", tile * 0.3, WALL_H - 0.05, tile);
      placeOnWall(g, moldPatch(0.6, 107) as unknown as THREE.Object3D, "s", tile * 0.3, 1.0, tile);
      cornerCobwebs(g, tile, 3);
    } else {
      place(g, barrel(), -(tile / 2 - 0.6), -(tile / 2 - 0.6), tile);
      place(g, barrel(), -(tile / 2 - 0.6), -(tile / 2 - 1.1), tile);
      place(g, barrel(), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
      place(g, crate(0.4), tile / 2 - 0.7, tile / 2 - 0.7, tile);
      place(g, crate(0.3), 0, tile / 2 - 0.6, tile);
      place(g, floorPuddle(0.4, 0x141c20), -0.4, 0.6, tile);
      placeOnWall(g, cobwebFunnel(0.5), "s", tile / 2 - 0.6, WALL_H - 0.4, tile);
    }
    placeOnWall(g, sconce(t.accent), "n", 0, 1.7, tile);
    // damp cold: mossy jars, broken glass, hanging chain, rats
    placeScatter(g, bottlesAndJars(scaleN(6, tile), scaleSpread(0.45, tile), 101), tile / 2 - 0.6, -(tile / 2 - 1.1), tile, scaleSpread(0.45, tile));
    if (big) g.add(glassShards(15, 1.6, 109));
    placeOnWall(g, chain(0.7, 0x2a2622), "w", 0, WALL_H - 0.05, tile);
    placeOnWall(g, moldPatch(0.7, 103) as unknown as THREE.Object3D, "e", 0, 0.8, tile);
    g.add(rats(scaleN(3, tile), scaleSpread(1.3, tile), 105));
  },

  "mystic-elevator": (g, t, tile, ctx) => {
    const big = tile >= 6;
    // the iron cage stands free at the room's centre in the big footprint;
    // legacy tiles keep the posts at the corners
    const pr = big ? 0.85 : tile / 2 - 0.5;
    const postH = big ? 2.6 : WALL_H - 0.1;
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const post = cyl(0.05, 0.05, postH, 0x6a6e72, 8, { metal: 0.8, rough: 0.3 });
      post.position.set(clampInner(sx * pr, tile), postH / 2, clampInner(sz * pr, tile));
      g.add(post);
    }
    if (big) {
      // filigree crown ring and the cable bundle climbing into the dark
      const crown = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.03, 6, 28), mat(0x6a6e72, { metal: 0.8, rough: 0.3 }));
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 2.6;
      g.add(crown);
      const cableM = mat(0x3a3e44, { metal: 0.7, rough: 0.4 });
      const cableGeo = new THREE.CylinderGeometry(0.015, 0.015, WALL_H - 2.6, 6);
      for (const [cx, cz] of [[0, 0], [0.08, 0.05], [-0.07, 0.06]] as const) {
        const cable = new THREE.Mesh(cableGeo, cableM);
        cable.position.set(cx, (WALL_H + 2.6) / 2, cz);
        g.add(cable);
      }
      // the brass panel is mounted on a cage post, dial glowing
      const panel = box(0.24, 0.4, 0.08, 0x2a2e3a, { metal: 0.5, rough: 0.5 });
      panel.position.set(0.95, 1.1, 0.85);
      panel.rotation.y = -Math.PI / 4;
      g.add(panel);
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), emissiveMat(t.accent, 1.2));
      dial.position.set(1.0, 1.2, 0.9);
      dial.rotation.y = Math.PI - Math.PI / 4;
      g.add(dial);
      // machinery beached in the corner: gears and the lever pedestal
      const gearM = mat(0x565a60, { metal: 0.8, rough: 0.35 });
      const gear1 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12), gearM);
      gear1.position.set(clampInner(2.5, tile), 0.36, clampInner(2.3, tile));
      gear1.rotation.z = 1.25;
      g.add(gear1);
      const gear2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 10), gearM);
      gear2.position.set(clampInner(2.15, tile), 0.25, clampInner(2.65, tile));
      gear2.rotation.z = 1.45;
      gear2.rotation.y = 0.5;
      g.add(gear2);
      const pedestal = box(0.26, 0.5, 0.26, 0x3a3228, { rough: 0.8 });
      pedestal.position.set(clampInner(-2.4, tile), 0.25, clampInner(1.6, tile));
      g.add(pedestal);
      const lever = cyl(0.015, 0.02, 0.4, 0x8a6a3a, 6, { metal: 0.7 });
      lever.position.set(clampInner(-2.35, tile), 0.65, clampInner(1.6, tile));
      lever.rotation.z = -0.5;
      g.add(lever);
      // three chains swing in a draft that shouldn't exist down here
      placeOnWall(g, chain(1.6, 0x2a2826), "s", -tile * 0.34, WALL_H - 0.05, tile);
      placeOnWall(g, chain(1.4, 0x2a2826), "s", tile * 0.34, WALL_H - 0.05, tile);
      placeOnWall(g, chain(1.2, 0x2a2826), "n", -tile * 0.32, WALL_H - 0.05, tile);
      // a soot ring where the cage grinds home
      placeFloorStain(g, "soot", 1.3, 0, 0, tile, 175);
      g.add(rubblePile(scaleN(6, tile), 1.05, 0x3a3632, 177));
      place(g, rug(2.0, 2.0, 0x2a2e3a, t.accent), 0, 0, tile);
    } else {
      const panel = box(0.3, 0.5, 0.1, 0x2a2e3a, { metal: 0.5, rough: 0.5 });
      placeOnWall(g, panel, "n", tile / 2 - 0.8, 1.1, tile);
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), emissiveMat(t.accent, 1.2));
      placeOnWall(g, dial, "n", tile / 2 - 0.8, 1.2, tile);
      placeOnWall(g, chain(1.6, 0x2a2826), "s", -0.6, WALL_H - 0.05, tile);
      placeOnWall(g, chain(1.4, 0x2a2826), "s", 0.6, WALL_H - 0.05, tile);
      place(g, rug(1.4, 1.4, 0x2a2e3a, t.accent), 0, 0, tile);
      placeFloorStain(g, "soot", 0.5, -0.4, 0.4, tile, 171);
    }
    placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, cobwebFunnel(0.5), "e", tile / 2 - 0.6, WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(0.9, 173) as unknown as THREE.Object3D, "w", 0.2, 1.4, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, big ? 4.0 : 3.0, 2);
    light.position.set(0, big ? 2.0 : 1.6, 0);
    g.add(light);
  },

  "upper-landing": (g, t, tile, ctx) => {
    const big = tile >= 6;
    if (big) {
      // a square of rug and a candle table just off-centre
      place(g, rug(2.2, 2.2, 0x3a3a5a, t.accent), 0, 0, tile);
      place(g, table(0.6, 0.35, 0.55), 0.5, 0, tile, Math.PI / 2);
      const cd = drippingCandle(0.2, 0xe8dcc0, t.accent);
      cd.position.y = 0.58;
      place(g, cd, 0.5, 0, tile);
      standAtWall(g, ctx, grandfatherClock(), ["n", "w", "e", "s"], tile, { fromWall: 0.45 });
      place(g, rockingChair(0x5a4636), tile / 2 - 0.85, -(tile / 2 - 0.85), tile, -Math.PI / 1.3);
      place(g, deadPlant(), -(tile / 2 - 0.75), -(tile / 2 - 0.75), tile);
      dressWalls(g, ctx, tile, t.accent, { portraits: 2, sconces: 1 });
      g.add(chandelier(t.accent));
      cornerCobwebs(g, tile, 3);
      place(g, dustPile(0.14, t.floor + 0x080808), -2.3, 1.9, tile);
    } else {
      place(g, rug(1.0, tile - 0.8, 0x3a3a5a, t.accent), 0, 0, tile);
      place(g, table(0.6, 0.35, 0.55), -(tile / 2 - 0.7), 0, tile, Math.PI / 2);
      place(g, drippingCandle(0.2, 0xe8dcc0, t.accent), -(tile / 2 - 0.7), 0.05, tile);
      placeOnWall(g, framedPortrait(0.5, 0.6), "n", 0, 1.5, tile);
      placeOnWall(g, sconce(t.accent), "e", 0, 1.5, tile);
      placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    // those creaking boards: warped planks, dust and webbed corners
    g.add(debrisPlank(scaleFlat(5, tile), scaleSpread(1.2, tile), 0x3a322a, 221));
    place(g, dustPile(0.16, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    placeFloorStain(g, "water", 0.5, tile / 2 - 0.8, -0.5, tile, 223);
    placeOnWall(g, peelingWallpaper(0.5, 0.8, t.wall, t.floor), "s", tile * 0.31, 1.3, tile);
    placeOnWall(g, wallCrack(0.9, 225) as unknown as THREE.Object3D, "e", -0.4, 1.4, tile);
  },

  "basement-landing": (g, t, tile, ctx) => {
    const big = tile >= 6;
    place(g, rug(big ? 1.2 : 0.9, big ? 2.6 : tile - 1.0, 0x3a352e, t.accent), 0, 0.2, tile);
    if (big) {
      // barrels lined against the driest wall; crates stacked where they fell.
      // With no known-solid wall the row splits to the corridor-safe ends.
      const rowWall = ctx.bestWall(["e", "w", "n", "s"]);
      for (const a of rowWall ? [-1.2, 0, 1.2] : [-2.0, 2.0]) {
        const slot = wallSlot(rowWall ?? "e", a, 0.65, tile);
        place(g, barrel(), slot.x, slot.z, tile);
      }
      place(g, crate(0.42), 2.4, 2.4, tile, 0.3);
      place(g, crate(0.32), 2.0, 2.65, tile, 0.7);
      place(g, crate(0.4), -(tile / 2 - 0.85), -(tile / 2 - 0.85), tile);
      // shelved specimens and second sconce for the long dark stair
      hangMid(g, ctx, () => specimenShelf(0x66c2a8), ["w", "n", "s", "e"], 1.3, tile, { halfW: 0.55 });
      placeOnWall(g, sconce(t.accent), "n", -tile * 0.3, 1.7, tile);
      placeOnWall(g, chain(1.1, 0x2a2622), "s", tile * 0.3, WALL_H - 0.05, tile);
      place(g, floorPuddle(0.5, 0x141c20), -1.8, 1.6, tile);
      cornerCobwebs(g, tile, 3);
    } else {
      place(g, crate(0.4), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
      place(g, barrel(), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
      placeOnWall(g, cobwebFunnel(0.5), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    }
    placeOnWall(g, sconce(t.accent), "n", 0, 1.7, tile);
    // wet stone tasting of old pennies: a puddle, mold, rats and rubble
    place(g, floorPuddle(0.38, 0x141c20), 0.4, tile / 2 - 0.8, tile);
    placeOnWall(g, moldPatch(0.7, 231) as unknown as THREE.Object3D, "e", 0, 0.8, tile);
    g.add(rats(scaleN(3, tile), scaleSpread(1.3, tile), 233));
    g.add(rubblePile(scaleN(7, tile), scaleSpread(0.6, tile), t.wall, 235));
    placeScatter(g, bottlesAndJars(scaleN(5, tile), scaleSpread(0.4, tile), 237), tile / 2 - 0.6, tile / 2 - 0.6, tile, scaleSpread(0.4, tile));
    placeOnWall(g, chain(0.6, 0x2a2622), "n", -0.6, WALL_H - 0.05, tile);
  },
};

/** Generic runner-style corridor/hallway dressing used for several rooms. */
function dressCorridor(g: THREE.Group, t: RoomTheme, tile: number, ctx: DecorCtx, seed = 1): void {
  const big = tile >= 6;
  // the runner walks the corridor's long (door) axis
  const alongZ = ctx.hasDoor("n") || ctx.hasDoor("s") || !ctx.known;
  const rw = big ? 1.3 : 0.9;
  const rl = tile - (big ? 0.8 : 0.4);
  place(g, rug(alongZ ? rw : rl, alongZ ? rl : rw, 0x5a2424, t.accent), 0, 0, tile);
  if (big) {
    // sconces and family portraits pace every solid wall
    dressWalls(g, ctx, tile, t.accent);
    // a console table at a solid mid-wall, a crate + dead plant in a corner
    const console_ = standAtWall(g, ctx, table(0.8, 0.35, 0.75), ["e", "w", "n", "s"], tile, { fromWall: 0.55 });
    const cd = drippingCandle(0.2, 0xe8dcc0, t.accent);
    cd.position.y = 0.78;
    const cdSlot = wallSlot(console_.side, console_.along + 0.1, 0.55, tile);
    place(g, cd, cdSlot.x, cdSlot.z, tile);
    place(g, crate(0.34), -(tile / 2 - 0.8), -(tile / 2 - 0.8), tile, 0.4);
    place(g, deadPlant(), -(tile / 2 - 0.75), -(tile / 2 - 1.3), tile);
  } else {
    placeOnWall(g, sconce(t.accent), "w", -0.5, 1.5, tile);
    placeOnWall(g, sconce(t.accent), "e", 0.5, 1.5, tile);
    placeOnWall(g, framedPortrait(0.45, 0.6), "n", 0, 1.5, tile);
  }
  // shared decay kit: cobwebbed corners, crack, peeling paper, dust, a stain
  decayKit(g, t, tile, seed);
}

COMPOSERS["dusty-hallway"] = (g, t, tile, ctx) => {
  dressCorridor(g, t, tile, ctx, 301);
  // decades of undisturbed dust, tracked in a trail nobody remembers making
  place(g, dustPile(0.16, t.floor + 0x080808), 0, tile / 2 - 0.7, tile);
  if (tile >= 6) {
    place(g, dustPile(0.14, t.floor + 0x080808), 0.5, 1.3, tile);
    place(g, dustPile(0.12, t.floor + 0x080808), 0.9, -0.4, tile);
    place(g, brokenChair(0x4a3a2c), -(tile / 2 - 0.75), 0.4, tile, 1.1);
  }
  g.add(scatteredPaper(scaleFlat(6, tile), scaleSpread(1.3, tile), 303));
};
COMPOSERS["creaking-corridor"] = (g, t, tile, ctx) => {
  dressCorridor(g, t, tile, ctx, 311);
  place(g, crate(0.3), -(tile / 2 - 0.6), tile / 2 - 0.6, tile);
  if (tile >= 6) {
    place(g, barrel(), -(tile / 2 - 0.7), tile / 2 - 1.15, tile);
    place(g, crate(0.36), tile / 2 - 0.8, -(tile / 2 - 0.8), tile, 0.5);
    place(g, brokenChair(0x4a3a2c), tile / 2 - 0.85, tile / 2 - 0.9, tile, 2.2);
    // a hook and chain that have no business in a hallway
    placeOnWall(g, chain(1.2, 0x2a2622), "s", -tile * 0.3, WALL_H - 0.05, tile);
    placeFloorStain(g, "water", 0.5, -1.6, -1.4, tile, 317);
  }
  // warped, snapped floorboards (the source of the creak)
  g.add(debrisPlank(scaleFlat(6, tile), scaleSpread(1.3, tile), 0x3a322a, 313));
  g.add(rats(scaleN(3, tile), scaleSpread(1.3, tile), 315));
};

/** Generic tasteful dressing for unknown rooms: rug + candlestick + crate + decay. */
function dressGeneric(g: THREE.Group, t: RoomTheme, tile: number, ctx: DecorCtx): void {
  const big = tile >= 6;
  place(g, rug(big ? 2.2 : 1.4, big ? 2.2 : 1.4, 0x4a3a2c, t.accent), 0, 0, tile);
  place(g, drippingCandle(0.22, 0xe8dcc0, t.accent), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
  place(g, crate(0.38), tile / 2 - 0.7, tile / 2 - 0.7, tile);
  hangMid(g, ctx, () => framedPortrait(0.45, 0.55), ["n", "e", "w", "s"], 1.6, tile, { halfW: 0.25 });
  if (big) {
    // fill the wider floor: a console table, a corner plant, extra wall trim
    const console_ = standAtWall(g, ctx, table(0.8, 0.35, 0.75), ["e", "w", "s", "n"], tile, { fromWall: 0.55 });
    placeOnWall(g, sconce(t.accent), console_.side, -tile * 0.3, 1.7, tile);
    placeOnWall(g, sconce(t.accent), console_.side, tile * 0.3, 1.7, tile);
    place(g, deadPlant(), -(tile / 2 - 0.75), tile / 2 - 0.75, tile);
    place(g, crate(0.3), tile / 2 - 1.2, tile / 2 - 0.75, tile, 0.6);
  }
  decayKit(g, t, tile, 321);
}

/**
 * Wall/ceiling-level trim material contract (consumed by BOTH frontends):
 * meshes tagged `userData.xrayTrim = true` sit at wall height and MUST fade
 * with their room's walls in the x-ray pass (otherwise faded walls leave
 * floating opaque bars over the characters), and their materials carry
 * `material.userData.baseColor` (hex) so fog-of-war can retint idempotently:
 * `mat.color.set(baseColor).multiplyScalar(0.35 + 0.65 * litFactor)`.
 */
function tagXrayTrim(m: THREE.Mesh): THREE.Mesh {
  m.userData.xrayTrim = true;
  return m;
}

/** Dark stained wood for trim/beams — a faint self-glow keeps it reading as
 *  wood (not a pure-black bar) over emissive-highlighted floors, even in
 *  fog-of-war-dimmed rooms. Fresh per call, like every decor material. */
function trimWood(color: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.05,
    emissive: color,
    emissiveIntensity: 0.12,
  });
  m.userData.baseColor = color;
  return m;
}

/**
 * Shared architectural trim every room gets: a crown cornice at the top of the
 * walls, corner + mid-wall pilasters, and ceiling beams. Door-safe by design —
 * the crown sits above doorway openings, corners never carry a doorway, and
 * the mid-wall pilasters at ±tile/4 clear the door zone in the 7-unit rooms —
 * so it applies to BOTH frontends at once. Everything is instanced: the whole
 * trim costs ~5 objects. Chair rails dress only the KNOWN-doorless walls.
 * Every mesh here is tagged via {@link tagXrayTrim} so the frontends' x-ray
 * passes fade it together with the room's walls.
 */
function roomArchitecture(g: THREE.Group, tile: number, ctx: DecorCtx): void {
  const inner = tile / 2 - 0.05;
  const trimMat = trimWood(0x3d2e1e); // dark stained oak
  const beamMat = trimWood(0x33251a);

  // Crown cornice ring at the very top of the walls (clears doorway openings).
  const crownY = WALL_H - 0.1;
  const crown = tagXrayTrim(
    instanced(new THREE.BoxGeometry(tile - 0.04, 0.13, 0.09), trimMat, [
      { pos: [0, crownY, -inner] },
      { pos: [0, crownY, inner] },
      { pos: [-inner, crownY, 0], rot: [0, Math.PI / 2, 0] },
      { pos: [inner, crownY, 0], rot: [0, Math.PI / 2, 0] },
    ])
  );
  crown.castShadow = true;
  g.add(crown);

  // Pilasters — the vertical architecture the bare walls lacked. Corners
  // always; mid-wall pairs once the walls are long enough to look naked.
  const ph = WALL_H - 0.04;
  const pilasterT: Array<{ pos: [number, number, number] }> = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pilasterT.push({ pos: [sx * inner, ph / 2, sz * inner] });
  if (tile >= 6) {
    const q = tile / 4; // clear of the <=2.2-wide door zone
    for (const a of [-q, q]) {
      pilasterT.push({ pos: [a, ph / 2, -inner] }, { pos: [a, ph / 2, inner] });
      pilasterT.push({ pos: [-inner, ph / 2, a] }, { pos: [inner, ph / 2, a] });
    }
  }
  const pilasters = tagXrayTrim(instanced(new THREE.BoxGeometry(0.14, ph, 0.14), trimMat, pilasterT));
  pilasters.castShadow = true;
  g.add(pilasters);

  // Ceiling beams spanning the room — two at tile 4, three across big rooms.
  // The gaps still let the top-down camera see the floor and tokens beneath.
  const beamXs = tile >= 6 ? [-tile * 0.3, 0, tile * 0.3] : [-tile * 0.24, tile * 0.24];
  const beams = tagXrayTrim(
    instanced(
      new THREE.BoxGeometry(0.16, 0.18, tile - 0.06),
      beamMat,
      beamXs.map((x) => ({ pos: [x, WALL_H - 0.22, 0] as [number, number, number] }))
    )
  );
  beams.castShadow = true;
  g.add(beams);

  // A chair rail breaks up the tall plaster on each KNOWN-doorless wall.
  const railSides = ctx.walls();
  if (tile >= 6 && railSides.length > 0) {
    const railT = railSides.map((s) => {
      const p = wallSlot(s, 0, 0.075, tile);
      return {
        pos: [p.x, 1.0, p.z] as [number, number, number],
        rot: [0, p.rot, 0] as [number, number, number],
      };
    });
    g.add(tagXrayTrim(instanced(new THREE.BoxGeometry(tile - 0.1, 0.07, 0.05), trimMat, railT)));
  }
}

/**
 * Worn runner rugs radiating from each KNOWN doorway in toward the walk ring.
 * Flat (well under the ring law's 0.06 decal exemption), so the door corridors
 * stay walkable while their bare lanes read furnished from the high tactical
 * camera. Raised slightly above the composers' room rugs so overlapping runs
 * (e.g. the entrance hall's own runner) never z-fight. All runners (base +
 * trim inlay per door) share ONE InstancedMesh — a single mesh however many
 * doorways the room has.
 */
function doorRunners(g: THREE.Group, t: RoomTheme, tile: number, ctx: DecorCtx): void {
  if (!ctx.known || tile < 6) return;
  const inner = tile / 2 - 0.25; // the door mouth
  const outer = PERIM_R - 0.35; // lapping just into the walk ring (flat-exempt)
  const len = inner - outer;
  const mid = (inner + outer) / 2;
  const base = new THREE.Color(t.floor).multiplyScalar(0.55).getHex();
  const trim = new THREE.Color(t.accent).multiplyScalar(0.38).getHex();
  const runs: Array<{ pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number]; color: number }> = [];
  for (const s of ALL_SIDES) {
    if (!ctx.hasDoor(s)) continue;
    const alongX = s === "n" || s === "s"; // runner runs along z for n/s doors
    const sign = s === "n" || s === "w" ? -1 : 1;
    const x = alongX ? 0 : sign * mid;
    const z = alongX ? sign * mid : 0;
    // in-plane spin (before laying flat) points the runner's length door-ward
    const rot: [number, number, number] = [-Math.PI / 2, 0, alongX ? 0 : Math.PI / 2];
    runs.push({ pos: [x, 0.026, z], rot, scale: [1.0, len, 1], color: base });
    runs.push({ pos: [x, 0.032, z], rot, scale: [0.72, len * 0.72, 1], color: trim });
  }
  if (runs.length) g.add(instanced(new THREE.PlaneGeometry(1, 1), mat(0xffffff, { rough: 1 }), runs));
}

/** Dev-only perf guardrail (the check is cheap; the warning matters in dev). */
const DECOR_DEV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== "production";
/** Mesh budget per decor group at tile 7 — past this, room piles hurt the GPU. */
const MESH_BUDGET = 120;

/**
 * Build the themed decoration props for a room as a single THREE.Group.
 * Returns a group that is always non-empty.
 *
 * X-ray/fog contract for callers: any descendant mesh with
 * `userData.xrayTrim === true` is wall-height trim (cornice, beams, pilasters,
 * rails, rafters) and must fade together with the room's walls in the
 * frontend's x-ray pass; its material carries `userData.baseColor` for
 * idempotent fog-of-war retinting (see {@link tagXrayTrim}).
 */
export function buildRoomDecor(
  roomId: string,
  tile = 7,
  opts: { doors?: ReadonlySet<DoorSide> } = {}
): THREE.Group {
  const group = new THREE.Group();
  group.name = `decor:${roomId}`;
  const theme = roomTheme(roomId);
  const ctx = makeCtx(opts.doors);
  const composer = COMPOSERS[roomId] ?? dressGeneric;
  composer(group, theme, tile, ctx);
  doorRunners(group, theme, tile, ctx);
  roomArchitecture(group, tile, ctx);
  if (DECOR_DEV) {
    let meshes = 0;
    let lights = 0;
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
      if ((o as THREE.Light).isLight) lights++;
    });
    if (meshes > MESH_BUDGET) console.warn(`[decor] ${roomId}: ${meshes} meshes exceeds the ${MESH_BUDGET} budget (tile=${tile})`);
    if (lights > 1) console.warn(`[decor] ${roomId}: ${lights} PointLights exceeds the 1-light budget`);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Character figures
// ---------------------------------------------------------------------------

/** Tagged limb references the shared animator reads off `g.userData.parts`. */
export interface FigureParts {
  head?: THREE.Object3D;
  torso?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  /** Gnashing Maw's hinged lower jaw. */
  jaw?: THREE.Object3D;
}

/** Deterministic 0..1 PRNG seeded from a string (shared by figure builders). */
function seededRand(s: string): () => number {
  let seed = 0;
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** A small deterministic per-figure phase (0..2π) derived from a string. */
function phaseFromString(s: string): number {
  const r = seededRand(s);
  return r() * Math.PI * 2;
}

/**
 * A little explorer figure tinted by `colorHex` (head + torso), with a head,
 * torso, two arms, two legs, and a thin glowing base disc. Origin at the feet
 * (y = 0 at the bottom); roughly 1.4 units tall.
 *
 * Pass `opts.archetype` (a character id: "vance" | "crow" | "penny" | "tobias"
 * | "odette" | "thorne") to render a distinct silhouette + signature prop while
 * still reading the player's identity colour. Unknown/absent → generic explorer.
 *
 * The returned group is tagged for {@link animateFigure}:
 *   g.userData.figKind = "explorer"
 *   g.userData.parts   = { head, torso, leftArm, rightArm }
 *   g.userData.phase   = small deterministic number
 */
export function buildExplorerFigure(
  colorHex: string,
  opts?: { archetype?: string },
): THREE.Group {
  const archetype = opts?.archetype;
  let fig: THREE.Group;
  switch (archetype) {
    case "vance": fig = buildVanceFigure(colorHex); break;
    case "crow": fig = buildCrowFigure(colorHex); break;
    case "penny": fig = buildPennyFigure(colorHex); break;
    case "tobias": fig = buildTobiasFigure(colorHex); break;
    case "odette": fig = buildOdetteFigure(colorHex); break;
    case "thorne": fig = buildThorneFigure(colorHex); break;
    default: fig = buildGenericExplorer(colorHex);
  }
  refineExplorer(fig);
  return fig;
}

/** Mark every opaque mesh in a figure as a shadow caster, so candle/moonlight
 *  throws a real grounded shadow. Transparent parts (smoke, glow decals, the
 *  contact pad) are skipped so they don't punch hard shadow holes. */
function castShadowsOnOpaque(g: THREE.Group): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as { isMesh?: boolean }).isMesh) return;
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    const transparent = Array.isArray(mat)
      ? mat.some((x) => (x as THREE.Material).transparent)
      : (mat as THREE.Material | undefined)?.transparent;
    if (!transparent) m.castShadow = true;
  });
}

/** Shared explorer post-process: ease the silhouette toward adult proportions
 *  (the oversized head is the dominant "toy" cue) and ground it with shadows. */
function refineExplorer(g: THREE.Group): void {
  const parts = g.userData.parts as FigureParts | undefined;
  if (parts?.head) {
    parts.head.scale.multiplyScalar(0.84);
    parts.head.position.y -= 0.012; // close the neck gap the smaller head opens
  }
  // Slim and heighten the whole figure (feet stay at the origin) so the
  // silhouette reads as an adult human instead of a squat figurine. Gentle so
  // held props and the contact ring don't distort.
  g.scale.set(0.95, 1.07, 0.95);
  castShadowsOnOpaque(g);
}

/** Shared explorer palette + glowing identity base disc. */
export function explorerKit(colorHex: string, g: THREE.Group) {
  const tint = new THREE.Color(colorHex);
  const bodyMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.62, metalness: 0.05 });
  const limbMat = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.7), roughness: 0.72, metalness: 0.05 });
  // Skin reads as flesh, not the player's identity colour: a warm tone carrying
  // only a faint tint, rougher than before (skin isn't glossy plastic), with a
  // low warm emissive so faces don't crush to pure black in the near-dark rooms.
  const flesh = new THREE.Color(0xc8a07c);
  const skin = new THREE.MeshStandardMaterial({
    color: flesh.clone().lerp(tint, 0.1),
    roughness: 0.82,
    metalness: 0,
    emissive: new THREE.Color(0x1a0c06),
    emissiveIntensity: 0.12,
  });
  const darkSkin = new THREE.MeshStandardMaterial({
    color: flesh.clone().multiplyScalar(0.8),
    roughness: 0.85,
    metalness: 0,
    emissive: new THREE.Color(0x140a05),
    emissiveIntensity: 0.12,
  });
  const cloth = (mix: number, dark = 0.0) =>
    new THREE.MeshStandardMaterial({
      color: tint.clone().lerp(new THREE.Color(0xffffff), mix).multiplyScalar(1 - dark),
      roughness: 0.78,
      metalness: 0.03,
    });
  const metal = new THREE.MeshStandardMaterial({ color: 0xcdd2d6, roughness: 0.25, metalness: 0.85, emissive: 0x9fb0bf, emissiveIntensity: 0.12 });

  // A grounding contact-shadow pad with a thin identity rim — replaces the old
  // bright glowing disc that made every figure read as a board-game token.
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 28),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.012;
  g.add(pad);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.016, 8, 36),
    new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.3, roughness: 0.5 }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.016;
  g.add(rim);

  return { tint, bodyMat, limbMat, skin, darkSkin, cloth, metal };
}

/** Tag a figure for the shared animator. */
export function tagFigure(g: THREE.Group, figKind: string, parts: FigureParts, seedStr: string) {
  g.userData.figKind = figKind;
  g.userData.parts = parts;
  g.userData.phase = phaseFromString(seedStr);
}

/** The original generic explorer (used when no/unknown archetype). */
function buildGenericExplorer(colorHex: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "figure:explorer";
  const { bodyMat, limbMat, skin } = explorerKit(colorHex, g);

  // legs
  const legH = 0.5;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, legH, 10), limbMat);
    leg.position.set(sx * 0.11, 0.05 + legH / 2, 0);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), limbMat);
    foot.position.set(sx * 0.11, 0.09, 0.05);
    g.add(foot);
  }

  // torso
  const torsoH = 0.45;
  const torsoY = 0.05 + legH + torsoH / 2;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, torsoH, 12), bodyMat);
  torso.position.y = torsoY;
  g.add(torso);
  // shoulders
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bodyMat);
  shoulders.scale.set(1, 0.5, 0.8);
  shoulders.position.y = torsoY + torsoH / 2;
  g.add(shoulders);

  // arms (pivot at the shoulder so the animator can swing them)
  const armH = 0.4;
  const arms: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const armPivot = new THREE.Group();
    armPivot.position.set(sx * 0.26, torsoY + 0.05 + armH / 2, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, armH, 10), bodyMat);
    arm.position.y = -armH / 2;
    arm.rotation.z = sx * 0.18;
    armPivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin);
    hand.position.set(0.05 * sx, -armH + 0.02, 0);
    armPivot.add(hand);
    g.add(armPivot);
    arms.push(armPivot);
  }

  // neck + head
  const headY = torsoY + torsoH / 2 + 0.2;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), skin);
  neck.position.y = headY - 0.15;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 14), skin);
  head.position.y = headY;
  g.add(head);
  // explorer hat brim (tinted) so the color reads clearly
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), bodyMat);
  hat.position.y = headY + 0.12;
  g.add(hat);
  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.12, 14), bodyMat);
  hatTop.position.y = headY + 0.18;
  g.add(hatTop);

  tagFigure(g, "explorer", { head, torso, leftArm: arms[0], rightArm: arms[1] }, "explorer:" + colorHex);
  return g;
}

/** Build a shoulder-pivoted arm so the animator can swing it. Returns the pivot. */
export function makeArm(
  sx: number,
  shoulderX: number,
  shoulderY: number,
  armH: number,
  mat: THREE.Material,
  handMat: THREE.Material,
  restZ = 0.18,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(sx * shoulderX, shoulderY, 0);
  // A shoulder cap closes the gap to the torso; the arm tapers wrist-ward and
  // ends in a flattened hand (a palm, not a bead). Kept a SINGLE segment on
  // purpose: several figures (e.g. Crow) stack their own forearm/fist over this,
  // and a multi-segment arm here would double up into bulbous limbs.
  const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), mat);
  pivot.add(shoulderCap);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, armH, 12), mat);
  arm.position.y = -armH / 2;
  arm.rotation.z = sx * restZ;
  pivot.add(arm);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), handMat);
  hand.scale.set(1.1, 0.62, 1.35); // a palm, not a ball
  hand.position.set(sx * 0.06, -armH + 0.02, 0);
  pivot.add(hand);
  return pivot;
}

// ===========================================================================
// Face & hair toolkit — composable, procedural facial features so explorers
// read as people (eyes/iris/pupils, nose, brows, mouth, ears, hair). All
// pieces are parented to the head mesh and placed on its front (+z) hemisphere,
// so they ride along when the animator bobs/turns the head. THREE-only (node-safe).
// ===========================================================================

export interface FaceOpts {
  /** Head radius (defaults to 0.15). */
  r?: number;
  /** Skin material for nose/ears (reused from the head). */
  skin: THREE.Material;
  /** Iris colour (hex). */
  eye?: number;
  /** Brow / lash colour (hex). */
  brow?: number;
  /** Lip colour (hex). */
  lip?: number;
  /** −1 frown … 0 neutral … 1 slight smile. */
  mood?: number;
  /** Eye openness 0 (closed/hollow) … 1 (wide). */
  open?: number;
}

/**
 * Paint a face (eyes, brows, nose shading, lips) onto a transparent canvas and
 * return it as a decal texture. A drawn face reads as human at any camera
 * distance, where protruding primitive eyeballs/cone-noses read as a doll.
 * Browser-only — the caller falls back to the primitive face under Node.
 */
function makeFaceTexture(opts: FaceOpts): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2;
  const hex = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
  const eyeCol = hex(opts.eye ?? 0x5b4636);
  const browCol = hex(opts.brow ?? 0x2a2018);
  const lipCol = hex(opts.lip ?? 0x9a5a52);
  const mood = opts.mood ?? 0;
  const open = Math.max(0.3, opts.open ?? 1);
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };

  const eyeY = S * 0.42;
  const eyeDX = S * 0.165;

  // soft eye-socket shading for depth
  for (const s of [-1, 1]) ellipse(cx + s * eyeDX, eyeY + S * 0.012, S * 0.108, S * 0.072, "rgba(60,42,32,0.16)");
  // eyes: sclera, iris, pupil, catch-light, upper-lid line
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX;
    ellipse(ex, eyeY, S * 0.082, S * 0.05 * open, "rgba(238,233,226,0.97)");
    ellipse(ex, eyeY, S * 0.04, S * 0.04 * Math.min(1, open + 0.25), eyeCol);
    ellipse(ex, eyeY, S * 0.018, S * 0.018, "#0a0a0c");
    ellipse(ex - S * 0.014, eyeY - S * 0.014, S * 0.008, S * 0.008, "rgba(255,255,255,0.85)");
    ctx.beginPath();
    ctx.strokeStyle = "rgba(28,20,16,0.6)";
    ctx.lineWidth = S * 0.013;
    ctx.ellipse(ex, eyeY, S * 0.082, S * 0.05 * open, 0, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();
  }
  // brows
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX;
    const by = eyeY - S * 0.085;
    ctx.beginPath();
    ctx.strokeStyle = browCol;
    ctx.lineWidth = S * 0.026;
    ctx.lineCap = "round";
    ctx.moveTo(ex - s * S * 0.058, by + s * mood * S * 0.022);
    ctx.quadraticCurveTo(ex, by - S * 0.02, ex + s * S * 0.058, by + S * 0.006 - s * mood * S * 0.022);
    ctx.stroke();
  }
  // nose — a soft side shadow and nostril hints, no geometry
  ctx.beginPath();
  ctx.strokeStyle = "rgba(70,48,36,0.22)";
  ctx.lineWidth = S * 0.02;
  ctx.lineCap = "round";
  ctx.moveTo(cx - S * 0.016, eyeY + S * 0.02);
  ctx.lineTo(cx - S * 0.03, eyeY + S * 0.125);
  ctx.quadraticCurveTo(cx, eyeY + S * 0.16, cx + S * 0.03, eyeY + S * 0.125);
  ctx.stroke();
  ellipse(cx - S * 0.026, eyeY + S * 0.142, S * 0.013, S * 0.009, "rgba(40,26,20,0.28)");
  ellipse(cx + S * 0.026, eyeY + S * 0.142, S * 0.013, S * 0.009, "rgba(40,26,20,0.28)");
  // lips
  const my = S * 0.66;
  ctx.beginPath();
  ctx.fillStyle = lipCol;
  ctx.moveTo(cx - S * 0.078, my);
  ctx.quadraticCurveTo(cx, my - S * 0.028, cx + S * 0.078, my);
  ctx.quadraticCurveTo(cx, my + S * 0.05, cx - S * 0.078, my);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = "rgba(60,30,30,0.45)";
  ctx.lineWidth = S * 0.01;
  ctx.moveTo(cx - S * 0.078, my + mood * S * 0.022);
  ctx.quadraticCurveTo(cx, my + S * 0.012, cx + S * 0.078, my + mood * S * 0.022);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Add a face to a head mesh (front = +z). Uses a painted face decal in the
 *  browser, falling back to the old primitive features under Node. */
export function addFace(head: THREE.Mesh, opts: FaceOpts): void {
  const r = opts.r ?? 0.15;
  if (typeof document === "undefined") {
    addPrimitiveFace(head, opts);
    return;
  }
  const tex = makeFaceTexture(opts);
  const decalMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 0.8,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  // A front sphere-section riding just outside the head, carrying the painted
  // face — so the features sit on the real curved skin instead of poking out.
  const decal = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.004, 48, 36, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.24, Math.PI * 0.52),
    decalMat,
  );
  head.add(decal);
  // small ears so the head reads in profile
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(r * 0.15, 10, 8), opts.skin);
    ear.position.set(sx * r * 0.95, -r * 0.02, 0);
    ear.scale.set(0.45, 0.85, 0.7);
    head.add(ear);
  }
}

/** The original protruding-primitive face — kept as the Node fallback. */
function addPrimitiveFace(head: THREE.Mesh, opts: FaceOpts): void {
  const r = opts.r ?? 0.15;
  const z = r * 0.86;
  const white = new THREE.MeshStandardMaterial({ color: 0xece7e0, roughness: 0.4 });
  const iris = new THREE.MeshStandardMaterial({ color: opts.eye ?? 0x5b4636, roughness: 0.35 });
  for (const sx of [-1, 1]) {
    const ex = sx * r * 0.42;
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 10, 8), white);
    eyeball.position.set(ex, r * 0.12, z * 0.92);
    eyeball.scale.set(1, Math.max(0.15, opts.open ?? 1), 0.6);
    head.add(eyeball);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 8, 8), iris);
    ir.position.set(ex, r * 0.12, z * 0.99);
    head.add(ir);
  }
}

export type HairStyle =
  | "short" | "bald" | "pigtails" | "bun" | "long" | "swept" | "cropped" | "wavy";

/** Add hair to a head mesh. Returns nothing; pieces are parented to the head. */
export function addHair(head: THREE.Mesh, style: HairStyle, color: number, r = 0.15): void {
  if (style === "bald") return;
  const hair = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  // skull cap covering the top/back, opening at the face
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hair,
  );
  cap.position.y = r * 0.06;
  cap.position.z = -r * 0.06;
  head.add(cap);

  if (style === "pigtails") {
    for (const sx of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 10, 10), hair);
      tail.position.set(sx * r * 1.05, -r * 0.1, -r * 0.1);
      tail.scale.set(0.8, 1.2, 0.8);
      head.add(tail);
    }
  } else if (style === "bun") {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 12, 12), hair);
    bun.position.set(0, r * 0.5, -r * 0.7);
    head.add(bun);
  } else if (style === "long" || style === "wavy") {
    const fall = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.05, r * 0.7, r * 2.2, 14, 1, true, 0, Math.PI),
      hair,
    );
    fall.position.set(0, -r * 0.7, -r * 0.5);
    fall.rotation.y = Math.PI;
    head.add(fall);
  } else if (style === "swept") {
    const sweep = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 10, 8), hair);
    sweep.position.set(r * 0.2, r * 0.55, r * 0.2);
    sweep.scale.set(1.4, 0.5, 1);
    head.add(sweep);
  }
}

/**
 * A menacing monster figure. Dispatches on `name` to a distinct builder for each
 * of the five haunt monsters ("Shade", "Acolyte", "Gnashing Maw", "The Drowned",
 * "Whisper"); unknown names fall back to the original generic dark/spiky brute so
 * nothing regresses. Origin at the feet (y = 0; floaters hover above a faint
 * ground glow instead). The `name` seeds deterministic variation.
 *
 * Each returned group is tagged for {@link animateFigure} via
 * `g.userData.figKind` and `g.userData.parts`.
 */
export function buildMonsterFigure(name: string): THREE.Group {
  let fig: THREE.Group;
  switch (name) {
    case "Shade": fig = buildShade(name); break;
    case "Acolyte": fig = buildAcolyte(name); break;
    case "Gnashing Maw": fig = buildGnashingMaw(name); break;
    case "The Drowned": fig = buildDrowned(name); break;
    case "Whisper": fig = buildWhisper(name); break;
    default: fig = buildGenericMonster(name);
  }
  castShadowsOnOpaque(fig);
  return fig;
}

const monsterDarkMat = () => new THREE.MeshStandardMaterial({ color: 0x14110f, roughness: 0.9, metalness: 0.1 });
const monsterSpikeMat = () => new THREE.MeshStandardMaterial({ color: 0x0e0c0a, roughness: 0.85, metalness: 0.15 });
const monsterEmberMat = (i = 0.9, color = 0xff1a1a) =>
  new THREE.MeshStandardMaterial({ color: 0xaa1414, emissive: color, emissiveIntensity: i, roughness: 0.5 });

/** A faint ground-glow decal for hovering monsters (replaces the solid disc). */
function groundGlowDecal(color: number, intensity = 0.5): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 24),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  return m;
}

/** The original generic brute (used for unknown monster names). */
function buildGenericMonster(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `figure:monster:${name}`;
  const rand = seededRand(name);

  const darkMat = monsterDarkMat;
  const spikeMat = monsterSpikeMat;
  const emberMat = monsterEmberMat;

  // dark base disc with faint red glow
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.04, 20), emberMat(0.4));
  base.position.y = 0.02;
  g.add(base);

  // hunched legs (irregular)
  const legH = 0.42;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, legH, 8), darkMat());
    leg.position.set(sx * 0.13, 0.05 + legH / 2, (rand() - 0.5) * 0.06);
    leg.rotation.x = (rand() - 0.5) * 0.2;
    g.add(leg);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), spikeMat());
    claw.position.set(sx * 0.13, 0.07, 0.12);
    claw.rotation.x = Math.PI / 2.2;
    g.add(claw);
  }

  // bulky irregular torso (icosahedron for jagged silhouette)
  const torsoH = 0.5;
  const torsoY = 0.05 + legH + torsoH / 2;
  const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), darkMat());
  torso.scale.set(1.0, torsoH / 0.4, 0.85);
  torso.position.y = torsoY;
  torso.rotation.y = rand() * Math.PI;
  g.add(torso);

  // spikes erupting from the back/shoulders
  const spikeCount = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < spikeCount; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05 + rand() * 0.03, 0.22 + rand() * 0.18, 6), spikeMat());
    const a = (i / spikeCount) * Math.PI * 2;
    const r = 0.18 + rand() * 0.08;
    spike.position.set(Math.cos(a) * r, torsoY + 0.18 + rand() * 0.12, Math.sin(a) * r * 0.7 - 0.1);
    spike.rotation.x = -0.5 + (rand() - 0.5) * 0.6;
    spike.rotation.z = (rand() - 0.5) * 0.6;
    g.add(spike);
  }

  // gnarled arms ending in claws
  const armH = 0.42;
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, armH, 7), darkMat());
    arm.position.set(sx * 0.3, torsoY + 0.02, 0.05);
    arm.rotation.z = sx * 0.5;
    arm.rotation.x = -0.3;
    g.add(arm);
    for (let c = 0; c < 3; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 5), spikeMat());
      claw.position.set(sx * (0.42 + c * 0.03), torsoY - armH / 2, 0.18 + (c - 1) * 0.05);
      claw.rotation.x = Math.PI / 1.8;
      g.add(claw);
    }
  }

  // misshapen head with glowing eyes
  const headY = torsoY + torsoH / 2 + 0.16;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), darkMat());
  head.scale.set(1.1, 0.95, 1.0);
  head.position.y = headY;
  head.position.z = 0.04;
  g.add(head);
  // horns
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 6), spikeMat());
    horn.position.set(sx * 0.1, headY + 0.16, 0.0);
    horn.rotation.z = sx * -0.4;
    horn.rotation.x = -0.3;
    g.add(horn);
  }
  // glowing eyes
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), emberMat(1.6));
    eye.position.set(sx * 0.07, headY + 0.02, 0.18);
    g.add(eye);
  }
  // jagged maw
  const maw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 6), emberMat(0.8));
  maw.position.set(0, headY - 0.08, 0.16);
  maw.rotation.x = Math.PI;
  g.add(maw);

  // unknown names use the legacy spin+bob path
  g.userData.figKind = "monster";
  g.userData.parts = { head, torso };
  g.userData.phase = phaseFromString(name);
  return g;
}

// --- Shade — tall wispy semi-transparent floating column -------------------
function buildShade(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `figure:monster:${name}`;
  const rand = seededRand(name);

  // faint cold ground glow (it floats)
  g.add(groundGlowDecal(0x2a3a55, 0.4));

  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0x10131c,
    emissive: 0x1a2640,
    emissiveIntensity: 0.25,
    roughness: 1.0,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });

  // tall wispy tapering column (no legs) — built from a few stacked lobes
  const torso = new THREE.Group();
  const colH = 1.2;
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.26, colH, 14, 1, true), smokeMat);
  body.position.y = 0.4 + colH / 2;
  torso.add(body);
  const lobeCount = 3;
  for (let i = 0; i < lobeCount; i++) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.18 - i * 0.03, 12, 10), smokeMat);
    lobe.position.set((rand() - 0.5) * 0.1, 0.55 + i * 0.28, (rand() - 0.5) * 0.08);
    lobe.scale.set(1, 1.3, 1);
    torso.add(lobe);
  }
  g.add(torso);

  // hooded shadowy head
  const headY = 0.4 + colH + 0.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), smokeMat);
  head.scale.set(1, 1.15, 1);
  head.position.y = headY;
  g.add(head);
  // cold blue/white eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, emissive: 0xaaddff, emissiveIntensity: 1.8, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeMat);
    eye.position.set(sx * 0.07, headY + 0.02, 0.16);
    g.add(eye);
  }

  // trailing smoky tendrils at the base
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.12 + rand() * 0.12;
    const tendril = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32 + rand() * 0.2, 8, 1, true), smokeMat);
    tendril.position.set(Math.cos(a) * r, 0.28 + rand() * 0.1, Math.sin(a) * r);
    tendril.rotation.x = Math.PI; // point downward, fading toward the floor
    tendril.rotation.z = (rand() - 0.5) * 0.5;
    g.add(tendril);
  }

  g.userData.figKind = "shadeFloat";
  g.userData.parts = { head, torso };
  g.userData.phase = phaseFromString(name);
  return g;
}

// --- Gnashing Maw — low, wide, mostly mouth --------------------------------
function buildGnashingMaw(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `figure:monster:${name}`;
  const rand = seededRand(name);

  // red base glow
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.04, 24), monsterEmberMat(0.45));
  base.position.y = 0.02;
  g.add(base);

  const flesh = new THREE.MeshStandardMaterial({ color: 0x2a0e0c, roughness: 0.85, metalness: 0.05 });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x7a0d0d, emissive: 0xff2a14, emissiveIntensity: 1.0, roughness: 0.6 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.5, metalness: 0.1 });

  // small low body lump
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), flesh);
  torso.scale.set(1.5, 0.7, 1.2);
  torso.position.y = 0.28;
  g.add(torso);

  const mouthY = 0.36;
  const mouthW = 0.42;

  // upper jaw (fixed) — wide shallow dome with red inner roof
  const upper = new THREE.Mesh(new THREE.SphereGeometry(mouthW, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), flesh);
  upper.scale.set(1.3, 0.7, 1.1);
  upper.position.y = mouthY + 0.06;
  g.add(upper);
  const roof = new THREE.Mesh(new THREE.SphereGeometry(mouthW * 0.85, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), innerMat);
  roof.scale.set(1.3, 0.6, 1.1);
  roof.position.y = mouthY + 0.06;
  g.add(roof);

  // lower jaw (hinged) — its own group pivoting at the back so it can chomp
  const jaw = new THREE.Group();
  jaw.position.set(0, mouthY, -0.2);
  const jawBowl = new THREE.Mesh(new THREE.SphereGeometry(mouthW, 16, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), innerMat);
  jawBowl.scale.set(1.3, 0.7, 1.1);
  jawBowl.position.set(0, 0, 0.2);
  jaw.add(jawBowl);
  const jawRim = new THREE.Mesh(new THREE.TorusGeometry(mouthW * 0.95, 0.04, 8, 20), flesh);
  jawRim.rotation.x = Math.PI / 2;
  jawRim.scale.set(1.3, 1.1, 1);
  jawRim.position.set(0, 0, 0.2);
  jaw.add(jawRim);

  // many small cone teeth on both jaws
  const teethN = 11;
  for (let i = 0; i < teethN; i++) {
    const a = (i / (teethN - 1) - 0.5) * Math.PI * 1.1;
    const tx = Math.sin(a) * mouthW * 1.15;
    const tz = Math.cos(a) * mouthW * 0.95;
    // upper teeth (point down)
    const ut = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13 + rand() * 0.05, 6), toothMat);
    ut.position.set(tx, mouthY + 0.02, tz);
    ut.rotation.x = Math.PI;
    g.add(ut);
    // lower teeth (point up), attached to the jaw
    const lt = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12 + rand() * 0.05, 6), toothMat);
    lt.position.set(tx, 0.02, tz + 0.2);
    jaw.add(lt);
  }
  g.add(jaw);

  // a couple of small beady eyes on top
  const eyeMat = monsterEmberMat(1.8);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    eye.position.set(sx * 0.18, mouthY + 0.34, 0.08);
    g.add(eye);
  }

  g.userData.figKind = "maw";
  g.userData.parts = { jaw, torso };
  g.userData.phase = phaseFromString(name);
  return g;
}

// --- The Drowned — hunched, water-logged, sagging --------------------------
function buildDrowned(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `figure:monster:${name}`;
  const rand = seededRand(name);

  // murky greenish ground glow
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.38, 0.04, 22),
    new THREE.MeshStandardMaterial({ color: 0x1c3a32, emissive: 0x244e42, emissiveIntensity: 0.5, roughness: 0.6 }),
  );
  base.position.y = 0.02;
  g.add(base);

  const fleshMat = new THREE.MeshStandardMaterial({ color: 0x2e4a44, emissive: 0x18302a, emissiveIntensity: 0.2, roughness: 0.9 });
  const weedMat = new THREE.MeshStandardMaterial({ color: 0x1f3a22, roughness: 0.95 });

  // heavy hunched legs
  const legH = 0.4;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, legH, 9), fleshMat);
    leg.position.set(sx * 0.14, 0.05 + legH / 2, 0.02);
    leg.rotation.x = 0.15;
    g.add(leg);
  }

  // sagging, hunched torso leaning forward
  const torsoY = 0.05 + legH + 0.26;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), fleshMat);
  torso.scale.set(1.1, 1.25, 1.0);
  torso.position.set(0, torsoY, 0.06);
  torso.rotation.x = 0.3; // hunched forward
  g.add(torso);
  // sagging belly/water-bloat lobes
  for (let i = 0; i < 3; i++) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.12 + rand() * 0.05, 10, 8), fleshMat);
    lobe.position.set((rand() - 0.5) * 0.3, torsoY - 0.18 - rand() * 0.1, 0.14 + rand() * 0.06);
    g.add(lobe);
  }

  // long heavy dripping arms
  const armH = 0.5;
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, armH, 8), fleshMat);
    arm.position.set(sx * 0.28, torsoY - 0.05, 0.1);
    arm.rotation.z = sx * 0.25;
    arm.rotation.x = 0.4;
    g.add(arm);
  }

  // hunched head with hollow dark eye sockets
  const headY = torsoY + 0.28;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), fleshMat);
  head.scale.set(1, 1.1, 1.05);
  head.position.set(0, headY, 0.16);
  head.rotation.x = 0.4;
  g.add(head);
  const socketMat = new THREE.MeshStandardMaterial({ color: 0x05100c, roughness: 1.0 });
  for (const sx of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), socketMat);
    socket.position.set(sx * 0.07, headY + 0.02, 0.31);
    g.add(socket);
  }

  // dripping / seaweed strands hanging off the body
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.16 + rand() * 0.18;
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.005, 0.22 + rand() * 0.22, 5), weedMat);
    const sy = torsoY - 0.05 - rand() * 0.2;
    strand.position.set(Math.cos(a) * r, sy, Math.sin(a) * r * 0.8 + 0.08);
    strand.rotation.z = (rand() - 0.5) * 0.4;
    g.add(strand);
  }

  g.userData.figKind = "drowned";
  g.userData.parts = { head, torso };
  g.userData.phase = phaseFromString(name);
  return g;
}

// --- Acolyte — sinister hooded cultist -------------------------------------
function buildAcolyte(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `figure:monster:${name}`;

  // faint red base glow
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.04, 22), monsterEmberMat(0.4));
  base.position.y = 0.02;
  g.add(base);

  const robeMat = new THREE.MeshStandardMaterial({ color: 0x140e14, roughness: 0.92, metalness: 0.03 });

  // floor-length dark robe (tapered cone, no legs)
  const robeH = 1.08;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, robeH, 16), robeMat);
  torso.position.y = 0.05 + robeH / 2;
  g.add(torso);
  const shoulderY = 0.05 + robeH;
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), robeMat);
  shoulders.scale.set(1, 0.6, 0.85);
  shoulders.position.y = shoulderY - 0.02;
  g.add(shoulders);

  // glowing red sigil on the chest
  const sigil = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.012, 6, 18),
    new THREE.MeshStandardMaterial({ color: 0xaa1010, emissive: 0xff2020, emissiveIntensity: 1.6, roughness: 0.4 }),
  );
  sigil.position.set(0, 0.05 + robeH * 0.62, 0.2);
  g.add(sigil);
  const sigilBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.14, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xaa1010, emissive: 0xff2020, emissiveIntensity: 1.6, roughness: 0.4 }),
  );
  sigilBar.position.set(0, 0.05 + robeH * 0.62, 0.2);
  g.add(sigilBar);

  // sleeves
  const armH = 0.5;
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.18, shoulderY - 0.06, 0);
  const lSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, armH, 9), robeMat);
  lSleeve.position.set(0.04, -armH / 2 + 0.04, 0.06);
  lSleeve.rotation.z = 0.4;
  leftArm.add(lSleeve);
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color: 0x9a8a82, roughness: 0.7 }));
  lHand.position.set(0.06, -armH + 0.06, 0.12);
  leftArm.add(lHand);
  g.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.18, shoulderY - 0.06, 0);
  const rSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, armH, 9), robeMat);
  rSleeve.position.set(-0.04, -armH / 2 + 0.04, 0.08);
  rSleeve.rotation.z = -0.4;
  rSleeve.rotation.x = -0.3;
  rightArm.add(rSleeve);
  // small dagger in the right hand
  const handMat = new THREE.MeshStandardMaterial({ color: 0x9a8a82, roughness: 0.7 });
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), handMat);
  rHand.position.set(-0.06, -armH + 0.06, 0.16);
  rightArm.add(rHand);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcdd2d6, roughness: 0.25, metalness: 0.85, emissive: 0x551010, emissiveIntensity: 0.3 });
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.2, 6), bladeMat);
  blade.position.set(-0.06, -armH + 0.18, 0.18);
  rightArm.add(blade);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 }));
  hilt.position.set(-0.06, -armH + 0.03, 0.16);
  rightArm.add(hilt);
  g.add(rightArm);

  // hood + shadowed head
  const headY = shoulderY + 0.14;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), new THREE.MeshStandardMaterial({ color: 0x060406, roughness: 1.0 }));
  head.position.y = headY;
  g.add(head);
  // glowing eyes in the shadow of the hood
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), monsterEmberMat(1.8));
    eye.position.set(sx * 0.05, headY + 0.02, 0.12);
    g.add(eye);
  }
  // hood shroud
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.4, 16, 1, true), robeMat);
  hood.position.y = headY + 0.08;
  g.add(hood);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 16), robeMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = headY - 0.06;
  g.add(collar);

  g.userData.figKind = "acolyte";
  g.userData.parts = { head, torso, leftArm, rightArm };
  g.userData.phase = phaseFromString(name);
  return g;
}

// --- Whisper — a hovering swarm of little dark shards -----------------------
function buildWhisper(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `figure:monster:${name}`;
  const rand = seededRand(name);

  // very faint pale ground glow
  g.add(groundGlowDecal(0x3a3a48, 0.3));

  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x14141c,
    emissive: 0x2a2a3a,
    emissiveIntensity: 0.3,
    roughness: 0.95,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ff, emissive: 0xccccff, emissiveIntensity: 1.6, roughness: 0.3 });

  // a tight cluster of small wisps/shards hovering around chest height
  const torso = new THREE.Group();
  torso.position.y = 0.78;
  const shardN = 9;
  for (let i = 0; i < shardN; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.06 + rand() * 0.24;
    const h = (rand() - 0.5) * 0.5;
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06 + rand() * 0.06, 0), shardMat);
    shard.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
    shard.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    shard.scale.set(1, 1.6 + rand(), 1);
    torso.add(shard);
    // several faint eyes scattered among the shards
    if (i % 2 === 0) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeMat);
      eye.position.set(Math.cos(a) * r, h, Math.sin(a) * r + 0.06);
      torso.add(eye);
    }
  }
  g.add(torso);

  // a few trailing tiny wisps below
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.1 + rand() * 0.18;
    const wisp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18 + rand() * 0.12, 6, 1, true), shardMat);
    wisp.position.set(Math.cos(a) * r, 0.35 + rand() * 0.15, Math.sin(a) * r);
    wisp.rotation.x = Math.PI;
    g.add(wisp);
  }

  g.userData.figKind = "whisperSwarm";
  g.userData.parts = { torso };
  g.userData.phase = phaseFromString(name);
  return g;
}

// ---------------------------------------------------------------------------
// Shared figure animator
// ---------------------------------------------------------------------------

/**
 * Skeleton-free idle animation shared by the React client and the standalone
 * artifact so the two never drift. Reads `fig.userData.figKind` and
 * `fig.userData.parts` (set by the figure builders) and mutates ONLY the
 * figure's own local transform (`fig.position.y` / `fig.rotation.y` / tagged
 * parts) — the CALLER owns the token's world position.
 *
 * Deterministic given `(t, phase)`, pure, node-safe, and never throws if parts
 * are missing (every access is guarded). Unknown `figKind` (or a missing one)
 * falls back to the original behaviour: explorers bob (0.05, or 0.12 when
 * active), monsters spin (`rotation.y = t*0.6`) + bob 0.1 — so the generic path
 * is byte-for-byte unchanged.
 *
 * @param fig   the figure group returned by buildExplorerFigure/buildMonsterFigure
 * @param t     elapsed time in seconds
 * @param opts.active  stronger/eager motion (explorer's turn)
 * @param opts.phase   per-figure phase offset; falls back to fig.userData.phase
 * @param opts.baseY   the figure's local rest height (default 0.02)
 */
export function animateFigure(
  fig: THREE.Group,
  t: number,
  opts?: { active?: boolean; phase?: number; baseY?: number },
): void {
  if (!fig) return;
  const ud = (fig.userData ?? {}) as {
    figKind?: string;
    parts?: FigureParts;
    phase?: number;
  };
  const figKind: string | undefined = ud.figKind;
  const parts: FigureParts = ud.parts ?? {};
  const active = !!opts?.active;
  const phase = opts?.phase ?? ud.phase ?? 0;
  const baseY = opts?.baseY ?? 0.02;

  switch (figKind) {
    case "explorer": {
      // gentle breathing (torso.scale.y), head bob, opposed arm sway, soft bob
      const breath = 1 + Math.sin(t * 2.4 + phase) * (active ? 0.05 : 0.03);
      if (parts.torso) parts.torso.scale.y = breath;
      if (parts.head) {
        parts.head.position.y = (parts.head.userData.baseY ??= parts.head.position.y)
          + Math.sin(t * 2 + phase) * 0.012;
        parts.head.rotation.z = Math.sin(t * 0.9 + phase) * 0.04;
      }
      const sway = Math.sin(t * 1.6 + phase) * (active ? 0.18 : 0.1);
      if (parts.leftArm) {
        parts.leftArm.rotation.x = (parts.leftArm.userData.baseRX ??= parts.leftArm.rotation.x) + sway;
      }
      if (parts.rightArm) {
        parts.rightArm.rotation.x = (parts.rightArm.userData.baseRX ??= parts.rightArm.rotation.x) - sway;
      }
      fig.position.y = baseY + Math.sin(t * 2 + phase) * (active ? 0.08 : 0.04);
      fig.rotation.y = Math.sin(t * 0.4 + phase) * 0.18 + (active ? 0.12 : 0);
      // a faint eager forward lean when active
      if (parts.torso) parts.torso.rotation.x = active ? 0.08 : 0;
      break;
    }

    case "shadeFloat":
    case "whisperSwarm": {
      // hover (large vertical sine) + slow lateral drift + slow yaw
      fig.position.y = baseY + 0.18 + Math.sin(t * 1.3 + phase) * 0.12;
      fig.rotation.y = t * 0.25 + phase;
      if (parts.torso) {
        parts.torso.position.x = Math.sin(t * 0.6 + phase) * 0.06;
        parts.torso.rotation.y = -t * 0.4;
      }
      // flicker opacity slightly if the body material is transparent
      flickerOpacity(fig, t, phase);
      if (parts.head) parts.head.position.x = Math.sin(t * 0.6 + phase) * 0.04;
      break;
    }

    case "maw": {
      // animate the jaw open/close (chomp)
      const chomp = Math.max(0, Math.sin(t * 3 + phase));
      if (parts.jaw) parts.jaw.rotation.x = chomp * 0.6;
      fig.position.y = baseY + Math.sin(t * 2 + phase) * 0.03;
      fig.rotation.y = Math.sin(t * 0.5 + phase) * 0.25;
      break;
    }

    case "drowned": {
      // slow heavy sway (rotation.z lilt) + bob
      fig.rotation.z = Math.sin(t * 0.8 + phase) * 0.06;
      fig.rotation.y = Math.sin(t * 0.3 + phase) * 0.15;
      fig.position.y = baseY + Math.sin(t * 1.1 + phase) * 0.05;
      if (parts.head) parts.head.rotation.z = Math.sin(t * 0.8 + phase + 0.5) * 0.05;
      break;
    }

    case "acolyte": {
      // breathing + slow menacing yaw
      if (parts.torso) parts.torso.scale.y = 1 + Math.sin(t * 1.8 + phase) * 0.025;
      fig.rotation.y = t * 0.35 + phase;
      fig.position.y = baseY + Math.sin(t * 1.6 + phase) * 0.04;
      break;
    }

    case "monster": {
      // legacy generic monster: spin + bob 0.1
      fig.rotation.y = t * 0.6;
      fig.position.y = baseY + Math.sin(t * 3) * 0.1;
      break;
    }

    default: {
      // unknown/missing figKind: replicate the OLD fallback exactly.
      // Explorers bob (0.05, or 0.12 active); monsters spin + bob 0.1. We can't
      // know which without a tag, so treat as an explorer bob (the artifact only
      // ever reaches here for untagged figures, which never happens now).
      fig.position.y = baseY + Math.sin(t * 2 + phase) * (active ? 0.12 : 0.05);
      break;
    }
  }
}

/** Flicker the opacity of transparent meshes slightly (for ghostly floaters). */
function flickerOpacity(fig: THREE.Object3D, t: number, phase: number): void {
  const f = 0.85 + Math.sin(t * 6 + phase) * 0.1 + Math.sin(t * 13.7 + phase * 2) * 0.05;
  fig.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    const apply = (m: THREE.Material) => {
      // only flicker materials that were authored transparent (skip glow decals
      // by leaving anything with depthWrite already off but opacity < 0.55 alone)
      if (m.transparent) {
        const base = (m.userData.baseOpacity ??= m.opacity);
        m.opacity = Math.min(1, Math.max(0.15, base * f));
      }
    };
    if (Array.isArray(mat)) mat.forEach(apply);
    else apply(mat);
  });
}
