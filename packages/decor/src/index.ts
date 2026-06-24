import * as THREE from "three";
import {
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

/**
 * @dread-hollow/decor
 *
 * Framework-agnostic three.js builders for themed room decorations and
 * character figures used by Dread Hollow.
 *
 * Coordinate system / conventions:
 *  - A room is a square footprint of side `tile` (default 4), centered at the
 *    origin. The floor's TOP surface is at y = 0; props rest ON the floor
 *    (y >= 0) and may hang from a ceiling at y ~= WALL_H (2.4).
 *  - Props stay within the inner area so they don't poke through walls:
 *    x, z in [-(tile/2 - WALL_MARGIN), +(tile/2 - WALL_MARGIN)].
 *  - The very center (a ~1.0 radius circle) is kept relatively clear so player
 *    figures placed there stay visible; furniture hugs the edges/corners.
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
const WALL_H = 2.4;
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

/** A bookshelf filled with rows of colored books. */
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
  for (let s = 0; s <= shelves; s++) {
    const y = (s / shelves) * (h - 0.1) + 0.05;
    const plank = box(w - 0.04, 0.04, 0.3, color);
    plank.position.set(0, y, 0);
    g.add(plank);
    if (s < shelves) {
      // books on this shelf
      const count = 9;
      for (let b = 0; b < count; b++) {
        const bx = -w / 2 + 0.1 + (b / (count - 1)) * (w - 0.2);
        const bh = 0.18 + ((b * 7 + s * 3) % 5) * 0.012;
        const bk = box(0.05, bh, 0.22, bookColors[(b + s) % bookColors.length]);
        bk.position.set(bx, y + bh / 2 + 0.02, 0);
        g.add(bk);
      }
    }
  }
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

/** A hanging chandelier (suspended from the ceiling). */
function chandelier(flame = 0xffae3a): THREE.Group {
  const g = new THREE.Group();
  const chain = cyl(0.01, 0.01, 0.4, 0x3a352c, 6, { metal: 0.6 });
  chain.position.y = WALL_H - 0.2;
  g.add(chain);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 18), mat(0x6a5a3a, { metal: 0.6, rough: 0.4 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = WALL_H - 0.45;
  g.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const c = candle(0.12, 0xf2e9d0, flame);
    c.position.set(Math.cos(a) * 0.28, WALL_H - 0.45, Math.sin(a) * 0.28);
    g.add(c);
  }
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

/** A bone niche (skull shelf) for catacombs/crypts. */
function boneNiche(): THREE.Group {
  const g = new THREE.Group();
  const shelf = box(0.5, 0.04, 0.2, 0x4a4038, { rough: 0.95 });
  g.add(shelf);
  for (let i = 0; i < 3; i++) {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), mat(0xd8d0c0, { rough: 0.9 }));
    skull.position.set(-0.15 + i * 0.15, 0.08, 0);
    g.add(skull);
    const jaw = box(0.07, 0.03, 0.05, 0xcfc6b4, { rough: 0.9 });
    jaw.position.set(-0.15 + i * 0.15, 0.03, 0.02);
    g.add(jaw);
  }
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

/**
 * Shared "decay kit": general dilapidation any room can wear — cobwebbed
 * corners, a wall crack, peeling wallpaper, dust in a corner and a floor stain.
 * Tuned to be cheap (instanced cracks/stains) and placed at the edges so the
 * centre stays clear. `seed` varies the clutter per room.
 */
function decayKit(g: THREE.Group, t: RoomTheme, tile: number, seed = 1): void {
  const edge = tile / 2 - 0.6;
  placeOnWall(g, cobwebFunnel(0.6), "n", -edge, WALL_H - 0.4, tile);
  placeOnWall(g, cobwebFunnel(0.5), "e", edge, WALL_H - 0.4, tile);
  placeOnWall(g, wallCrack(0.9, seed) as unknown as THREE.Object3D, "w", 0.1, 1.4, tile);
  placeOnWall(g, peelingWallpaper(0.5, 0.8, t.wall + 0x101010, t.floor), "s", edge - 0.2, 1.3, tile);
  place(g, dustPile(0.16, t.floor + 0x080808) as unknown as THREE.Group, -edge, edge, tile);
  placeFloorStain(g, "water", 0.5, edge * 0.6, -edge * 0.6, tile, seed + 7);
}

/**
 * Shared "grime kit": service/storage filth — rats, scattered bottles, a mold
 * patch, a hanging chain and rubble. Layered on top of the structural props of
 * cellars, larders, kitchens, boiler/service rooms.
 */
function grimeKit(g: THREE.Group, t: RoomTheme, tile: number, seed = 1): void {
  const edge = tile / 2 - 0.55;
  g.add(rats(4, 1.4, seed));
  place(g, bottlesAndJars(7, 0.5, seed), edge, edge, tile);
  placeOnWall(g, moldPatch(0.6, seed + 3) as unknown as THREE.Object3D, "n", -edge + 0.2, 0.7, tile);
  g.add(rubblePile(8, 0.6, t.wall, seed + 5));
  const ch = chain(0.7, 0x2a2622);
  placeOnWall(g, ch, "e", -edge * 0.4, WALL_H - 0.05, tile);
  placeFloorStain(g, "mold", 0.5, -edge * 0.5, edge * 0.5, tile, seed + 9);
}

type Composer = (g: THREE.Group, theme: RoomTheme, tile: number) => void;

const COMPOSERS: Record<string, Composer> = {
  chapel: (g, t, tile) => {
    place(g, altar(t.accent), 0, -(tile / 2 - 0.7), tile);
    place(g, pew(), -0.55, 0.3, tile);
    place(g, pew(), 0.55, 0.3, tile);
    place(g, pew(), -0.55, 1.0, tile);
    place(g, pew(), 0.55, 1.0, tile);
    place(g, drippingCandle(0.5, 0xe8dcc0, t.accent), -0.6, -(tile / 2 - 0.7), tile);
    place(g, drippingCandle(0.5, 0xe8dcc0, t.accent), 0.6, -(tile / 2 - 0.7), tile);
    placeOnWall(g, glowWindow(t.accent), "n", -0.7, 1.45, tile);
    placeOnWall(g, glowWindow(t.accent), "n", 0.7, 1.45, tile);
    // a fallen candelabrum and spilt holy water in the aisle
    place(g, candlestick(t.accent), tile / 2 - 0.6, tile / 2 - 0.7, tile);
    placeFloorStain(g, "water", 0.6, 0, 1.0, tile, 11);
    placeOnWall(g, cobwebFunnel(0.6), "e", tile / 2 - 0.6, WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(1.0, 3) as unknown as THREE.Object3D, "w", 0.2, 1.5, tile);
    placeOnWall(g, peelingWallpaper(0.5, 0.8, t.wall, t.floor), "w", tile / 2 - 0.7, 1.3, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, 4.0, 2);
    light.position.set(0, 1.1, -(tile / 2 - 0.7));
    g.add(light);
  },

  library: (g, t, tile) => {
    placeOnWall(g, bookshelf(1.0, 1.4, 0x3a2718), "n", -0.6, 0, tile);
    placeOnWall(g, bookshelf(1.0, 1.4, 0x3a2718), "n", 0.6, 0, tile);
    placeOnWall(g, bookshelf(1.0, 1.4, 0x3a2718), "w", -0.6, 0, tile);
    placeOnWall(g, bookshelf(1.0, 1.4, 0x3a2718), "w", 0.6, 0, tile);
    place(g, table(0.9, 0.55, 0.55), 0.8, 0.9, tile, -0.4);
    place(g, chair(), 0.95, 1.25, tile, Math.PI);
    place(g, globe(), 0.95, 0.85, tile);
    place(g, drippingCandle(0.18, 0xe8dcc0, t.accent), 0.6, 0.75, tile);
    place(g, rug(2.0, 1.6, 0x5a2222, t.accent), 0, 0.3, tile);
    // toppled volumes, loose pages and creeping damp
    place(g, crate(0.3, 0x4a3422), tile / 2 - 0.7, -(tile / 2 - 0.7), tile);
    g.add(scatteredPaper(9, 1.5, 31));
    placeFloorStain(g, "water", 0.5, -0.6, tile / 2 - 0.8, tile, 33);
    placeOnWall(g, cobwebFunnel(0.5), "e", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, peelingWallpaper(0.5, 0.8, t.wall, t.floor), "e", tile / 2 - 0.7, 1.3, tile);
  },

  study: (g, t, tile) => {
    place(g, table(1.0, 0.6, 0.55, 0x3c2f20), 0, -(tile / 2 - 0.8), tile);
    place(g, chair(0x3c2f20), 0, -(tile / 2 - 1.3), tile, Math.PI);
    place(g, globe(), -0.35, -(tile / 2 - 0.8) + 0.1, tile);
    place(g, drippingCandle(0.2, 0xe8dcc0, t.accent), 0.35, -(tile / 2 - 0.8) + 0.1, tile);
    placeOnWall(g, bookshelf(0.9, 1.3), "e", 0, 0, tile);
    placeOnWall(g, framedPortrait(0.5, 0.6), "w", 0.4, 1.4, tile);
    place(g, rug(1.6, 1.4, 0x3a2a4a, t.accent), 0, 0.4, tile);
    // the journal's pages strewn about, an overturned chair and dripped ink
    place(g, brokenChair(0x3c2f20), tile / 2 - 0.7, tile / 2 - 0.7, tile, 0.5);
    g.add(scatteredPaper(8, 1.3, 41));
    placeFloorStain(g, "blood", 0.4, 0.1, -(tile / 2 - 0.8) + 0.4, tile, 43);
    placeOnWall(g, cobwebFunnel(0.5), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(0.9, 9) as unknown as THREE.Object3D, "s", 0.3, 1.5, tile);
  },

  kitchen: (g, t, tile) => {
    // counter
    placeOnWall(g, box(1.4, 0.85, 0.5, 0x6a5236), "n", 0, 0.425, tile);
    // stove
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
    // hanging utensils
    for (let i = 0; i < 4; i++) {
      const u = cyl(0.012, 0.012, 0.22, 0x9a9690, 6, { metal: 0.6 });
      placeOnWall(g, u, "w", -0.6 + i * 0.25, WALL_H - 0.4, tile);
    }
    // grime: rats, jars, hanging chain, mold, grease stain
    g.add(rats(4, 1.4, 81));
    place(g, bottlesAndJars(7, 0.5, 83), tile / 2 - 0.6, tile / 2 - 0.6, tile);
    placeOnWall(g, chain(0.6, 0x2a2622), "w", 0.6, WALL_H - 0.05, tile);
    placeFloorStain(g, "soot", 0.5, tile / 2 - 0.7, -(tile / 2 - 0.7) + 0.5, tile, 85);
    placeOnWall(g, moldPatch(0.6, 87) as unknown as THREE.Object3D, "s", -0.4, 0.7, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, 3.5, 2);
    light.position.set(tile / 2 - 0.7, 0.9, -(tile / 2 - 0.7));
    g.add(light);
  },

  "dining-room": (g, t, tile) => {
    place(g, table(1.8, 0.7, 0.6, 0x4a3220), 0, 0, tile);
    for (const z of [-0.55, 0.55]) {
      place(g, chair(0x4a3220), -1.05, z, tile, Math.PI / 2);
      place(g, chair(0x4a3220), 1.05, z, tile, -Math.PI / 2);
    }
    place(g, candlestick(t.accent), -0.4, 0, tile);
    place(g, drippingCandle(0.22, 0xe8dcc0, t.accent), 0.4, 0, tile);
    g.add(chandelier(t.accent));
    // a feast long abandoned: a toppled chair, bottles, dust, a wine-dark stain
    place(g, brokenChair(0x4a3220), 1.05, 0, tile, -Math.PI / 2);
    place(g, bottlesAndJars(5, 0.4, 161), 0, -0.05, tile);
    placeFloorStain(g, "blood", 0.5, 0.6, 0.7, tile, 163);
    place(g, dustPile(0.15, t.floor + 0x080808), -(tile / 2 - 0.7), tile / 2 - 0.7, tile);
    placeOnWall(g, framedPortrait(0.5, 0.65), "n", 0, 1.5, tile);
    placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, peelingWallpaper(0.5, 0.9, t.wall, t.floor), "e", 0, 1.35, tile);
  },

  "master-bedroom": (g, t, tile) => {
    place(g, bed(0.95, 1.5, 0x3a2538, 0x6a6478), 0, -(tile / 2 - 1.0), tile);
    place(g, wardrobe(0x3a2a3a), -(tile / 2 - 0.6), tile / 2 - 0.8, tile, Math.PI / 2);
    place(g, table(0.4, 0.4, 0.45), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
    place(g, drippingCandle(0.18, 0xe8dcc0, t.accent), tile / 2 - 0.6, -(tile / 2 - 0.6) + 0.05, tile);
    place(g, rug(1.6, 1.4, 0x3a2a4a, t.accent), 0, 0.6, tile);
    placeOnWall(g, framedPortrait(0.5, 0.6), "n", 0, 1.5, tile);
    // a torn drape, dust at the bedfoot and damp staining the wall
    placeOnWall(g, tornCurtain(0.6, 1.3, 0x3a2238), "e", 0, WALL_H / 2, tile);
    place(g, dustPile(0.16, t.floor + 0x080808), tile / 2 - 0.8, tile / 2 - 0.7, tile);
    placeFloorStain(g, "water", 0.5, -(tile / 2 - 0.8), -(tile / 2 - 0.8), tile, 51);
    placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, peelingWallpaper(0.5, 0.9, t.wall, t.floor), "s", -(tile / 2 - 0.7), 1.35, tile);
  },

  "servants-quarters": (g, t, tile) => {
    place(g, bed(0.7, 1.3, 0x4a3424), -(tile / 2 - 0.7), -(tile / 2 - 1.0), tile, Math.PI / 2);
    place(g, bed(0.7, 1.3, 0x4a3424), tile / 2 - 0.7, -(tile / 2 - 1.0), tile, -Math.PI / 2);
    place(g, crate(0.35), 0, tile / 2 - 0.6, tile);
    place(g, drippingCandle(0.2, 0xe8dcc0, t.accent), 0, -(tile / 2 - 0.6), tile);
    place(g, rug(1.4, 1.2, 0x4a3a28, t.accent), 0, 0.4, tile);
    // a hurried departure: scattered belongings, dust and creeping mold
    g.add(scatteredPaper(7, 1.3, 61));
    place(g, dustPile(0.15, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    g.add(rats(3, 1.2, 6));
    placeOnWall(g, moldPatch(0.6, 63) as unknown as THREE.Object3D, "n", 0, 0.8, tile);
    placeOnWall(g, cobwebFunnel(0.5), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(0.9, 65) as unknown as THREE.Object3D, "e", 0.2, 1.4, tile);
  },

  "abandoned-nursery": (g, t, tile) => {
    place(g, crib(0xb0a0a8), 0, -(tile / 2 - 0.9), tile);
    place(g, rockingChair(0x5a4636), tile / 2 - 0.7, tile / 2 - 0.8, tile, -Math.PI / 1.3);
    place(g, wardrobe(0x4a3a44), -(tile / 2 - 0.6), tile / 2 - 0.8, tile, Math.PI / 2);
    // a little ball toy
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat(t.accent, { rough: 0.6 }));
    ball.position.set(clampInner(0.4, tile), 0.1, clampInner(0.6, tile));
    g.add(ball);
    place(g, rug(1.6, 1.4, 0x6a5a64, t.accent), 0, 0.3, tile);
    placeOnWall(g, cobwebFunnel(0.6), "n", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    // unsettling neglect: a tattered curtain, scattered toys, a ghost portrait
    placeOnWall(g, tornCurtain(0.6, 1.1, 0x6a4a58), "e", 0.3, WALL_H / 2 + 0.2, tile);
    placeOnWall(g, framedPortrait(0.4, 0.5, 0x5a4a52, 0x2a242c), "w", 0, 1.4, tile);
    const ball2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), mat(0x8aa0c0, { rough: 0.6 }));
    ball2.position.set(clampInner(-0.5, tile), 0.08, clampInner(-0.2, tile));
    g.add(ball2);
    place(g, dustPile(0.14, t.floor + 0x080808), -(tile / 2 - 0.7), 0.3, tile);
    placeFloorStain(g, "mold", 0.45, tile / 2 - 0.8, -(tile / 2 - 0.7), tile, 71);
    placeOnWall(g, wallCrack(0.8, 73) as unknown as THREE.Object3D, "s", -0.2, 1.4, tile);
  },

  crypt: (g, t, tile) => {
    place(g, sarcophagus(), 0, 0, tile);
    place(g, boneNiche(), -(tile / 2 - 0.4), -0.6, tile, Math.PI / 2);
    place(g, boneNiche(), -(tile / 2 - 0.4), 0.6, tile, Math.PI / 2);
    place(g, drippingCandle(0.4, 0xe8dcc0, t.accent), -(tile / 2 - 0.6), -(tile / 2 - 0.6), tile);
    place(g, drippingCandle(0.4, 0xe8dcc0, t.accent), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
    place(g, candle(0.4), tile / 2 - 0.6, tile / 2 - 0.6, tile);
    // bones spilling from the ajar lid + grave dust and cobwebs
    place(g, bonePile(9, 0.5, 5), tile / 2 - 0.7, tile / 2 - 0.9, tile);
    place(g, skull(1.0), 0.2, 0.7, tile, 0.6);
    placeFloorStain(g, "blood", 0.6, 0, 0.7, tile, 13);
    placeOnWall(g, cobwebFunnel(0.6), "n", tile / 2 - 0.6, WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(1.1, 7) as unknown as THREE.Object3D, "e", 0, 1.4, tile);
    g.add(rats(3, 1.2, 4));
    const light = new THREE.PointLight(t.accent, t.accentIntensity, 3.5, 2);
    light.position.set(0, 0.9, 0);
    g.add(light);
  },

  catacomb: (g, t, tile) => {
    place(g, pillar(WALL_H, 0x5a544c), -(tile / 2 - 0.6), -(tile / 2 - 0.6), tile);
    place(g, pillar(WALL_H, 0x5a544c), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
    place(g, boneNiche(), -(tile / 2 - 0.4), 0.4, tile, Math.PI / 2);
    place(g, boneNiche(), tile / 2 - 0.4, 0.4, tile, -Math.PI / 2);
    place(g, boneNiche(), -(tile / 2 - 0.4), 1.1, tile, Math.PI / 2);
    place(g, sarcophagus(), 0, tile / 2 - 1.0, tile, Math.PI / 2);
    place(g, drippingCandle(0.35, 0xe8dcc0, t.accent), 0, 0, tile);
    // ossuary clutter: bone heaps and scattered skulls between the pillars
    place(g, bonePile(11, 0.6, 8), -(tile / 2 - 0.7), 0, tile);
    place(g, bonePile(8, 0.5, 12), tile / 2 - 0.7, 1.0, tile);
    place(g, skull(1.0), -0.4, -0.4, tile, 0.3);
    place(g, skull(0.9), 0.5, -0.5, tile, 1.2);
    placeOnWall(g, cobwebFunnel(0.6), "s", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, moldPatch(0.7, 14) as unknown as THREE.Object3D, "w", 0.4, 0.8, tile);
    g.add(rats(4, 1.5, 6));
    const light = new THREE.PointLight(t.accent, t.accentIntensity, 3.0, 2);
    light.position.set(0, 0.8, 0.3);
    g.add(light);
  },

  "pentagram-chamber": (g, t, tile) => {
    g.add(pentagramDecal(t.accent, Math.min(1.3, tile / 2 - 0.6)));
    const ringR = Math.min(1.45, tile / 2 - 0.45);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      place(g, drippingCandle(0.4, 0xf2e9d0, t.accent), Math.cos(a) * ringR, Math.sin(a) * ringR, tile);
    }
    place(g, cauldron(t.accent), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    // ritual aftermath: blood spatter, bones, scattered chants and skulls
    placeFloorStain(g, "blood", 0.7, -(tile / 2 - 0.8), tile / 2 - 0.8, tile, 17);
    placeFloorStain(g, "blood", 0.5, tile / 2 - 0.9, -(tile / 2 - 0.8), tile, 19);
    place(g, bonePile(8, 0.5, 21), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
    place(g, skull(1.1), -(tile / 2 - 0.8), tile / 2 - 0.7, tile, 0.8);
    g.add(scatteredPaper(7, 1.6, 23));
    placeOnWall(g, clawMarks(0.6, 4, 25) as unknown as THREE.Object3D, "n", 0, 1.3, tile);
    placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, 4.0, 2);
    light.position.set(0, 0.6, 0);
    g.add(light);
  },

  "boiler-room": (g, t, tile) => {
    // big boiler cylinder
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
    place(g, boiler, -(tile / 2 - 0.8), -(tile / 2 - 0.8), tile);
    // pipes along a wall
    for (let i = 0; i < 3; i++) {
      const pipe = cyl(0.05, 0.05, tile - 0.6, 0x6a6258, 10, { metal: 0.7, rough: 0.4 });
      pipe.rotation.z = Math.PI / 2;
      placeOnWall(g, pipe, "e", 0, 0.6 + i * 0.45, tile);
    }
    // valve wheels
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 14), mat(0x8a8278, { metal: 0.7 }));
    placeOnWall(g, valve, "e", -0.6, 1.05, tile);
    // industrial filth: soot stains, scattered coal/rubble, chains, rats
    placeFloorStain(g, "soot", 0.7, -(tile / 2 - 0.8), -(tile / 2 - 0.8) + 0.7, tile, 111);
    g.add(rubblePile(9, 0.7, 0x2a2622, 113));
    placeOnWall(g, chain(0.8, 0x2a2622), "n", -0.7, WALL_H - 0.05, tile);
    placeOnWall(g, chain(0.6, 0x2a2622), "n", -0.4, WALL_H - 0.05, tile);
    place(g, barrel(0x4a3a2a), tile / 2 - 0.6, tile / 2 - 0.6, tile);
    g.add(rats(3, 1.4, 115));
    placeOnWall(g, moldPatch(0.6, 117) as unknown as THREE.Object3D, "s", -0.4, 0.7, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, 4.0, 2);
    light.position.set(-(tile / 2 - 0.8), 0.7, -(tile / 2 - 0.8) + 0.4);
    g.add(light);
  },

  conservatory: (g, t, tile) => {
    place(g, deadPlant(), -(tile / 2 - 0.6), -(tile / 2 - 0.6), tile);
    place(g, deadPlant(), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
    place(g, deadPlant(), -(tile / 2 - 0.6), tile / 2 - 0.6, tile);
    place(g, deadPlant(), tile / 2 - 0.6, tile / 2 - 0.6, tile);
    // bench
    const bench = new THREE.Group();
    const seat = box(1.0, 0.05, 0.3, 0x4a4a3a);
    seat.position.y = 0.4;
    bench.add(seat);
    for (const sx of [-1, 1]) {
      const leg = box(0.06, 0.4, 0.28, 0x3a3a2a);
      leg.position.set(sx * 0.4, 0.2, 0);
      bench.add(leg);
    }
    place(g, bench, 0, tile / 2 - 0.7, tile, Math.PI);
    placeOnWall(g, glowWindow(t.accent), "n", 0, 1.45, tile);
    // overgrown ruin: spilled soil, broken glass under the window, mold, vines
    place(g, deadPlant(), 0, -(tile / 2 - 0.6), tile);
    g.add(glassShards(10, 1.2, 121));
    placeFloorStain(g, "mold", 0.6, -0.5, 0.5, tile, 123);
    placeOnWall(g, moldPatch(0.7, 125) as unknown as THREE.Object3D, "w", 0, 0.9, tile);
    placeOnWall(g, cobwebFunnel(0.6), "e", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(1.0, 127) as unknown as THREE.Object3D, "s", 0.3, 1.4, tile);
  },

  vault: (g, t, tile) => {
    placeOnWall(g, vaultDoor(), "n", 0, 0, tile);
    place(g, goldPile(), -(tile / 2 - 0.7), tile / 2 - 0.7, tile);
    place(g, goldPile(), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    place(g, goldPile(), 0, tile / 2 - 0.6, tile);
    place(g, crate(0.4, 0x5a4a2c), tile / 2 - 0.7, -(tile / 2 - 0.7), tile);
    // someone (or something) tried to break in: claw-raked door, scattered
    // coins, a fallen chain and a dark stain by the threshold
    placeOnWall(g, clawMarks(0.7, 4, 131) as unknown as THREE.Object3D, "n", -0.5, 1.0, tile);
    placeOnWall(g, clawMarks(0.6, 3, 133) as unknown as THREE.Object3D, "n", 0.5, 0.8, tile);
    place(g, bonePile(6, 0.4, 135), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
    placeOnWall(g, chain(0.7, 0x3a342c), "e", 0, WALL_H - 0.05, tile);
    placeFloorStain(g, "blood", 0.45, 0, -0.2, tile, 137);
    placeOnWall(g, cobwebFunnel(0.5), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, 3.0, 2);
    light.position.set(0, 0.5, tile / 2 - 0.7);
    g.add(light);
  },

  gymnasium: (g, _t, tile) => {
    // vaulting horse
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
    place(g, horse, 0, -(tile / 2 - 0.9), tile);
    // weights
    for (let i = 0; i < 3; i++) {
      const plate = cyl(0.16, 0.16, 0.04, 0x2a2a2c, 16, { metal: 0.6, rough: 0.5 });
      plate.rotation.z = Math.PI / 2;
      plate.position.set(clampInner(-0.6 + i * 0.3, tile), 0.16, clampInner(tile / 2 - 0.7, tile));
      g.add(plate);
    }
    // a wall bar
    const bar = cyl(0.04, 0.04, 1.4, 0x8a8278, 10, { metal: 0.6 });
    bar.rotation.z = Math.PI / 2;
    placeOnWall(g, bar, "e", 0, 1.2, tile);
    // rot and those handprints far too high up the wall
    placeOnWall(g, clawMarks(0.5, 5, 141) as unknown as THREE.Object3D, "n", -0.3, 2.0, tile);
    placeOnWall(g, clawMarks(0.5, 5, 143) as unknown as THREE.Object3D, "n", 0.4, 2.1, tile);
    place(g, brokenChair(0x5a4636), -(tile / 2 - 0.7), tile / 2 - 0.7, tile, 0.8);
    g.add(debrisPlank(6, 1.3, 0x4a3a2a, 145));
    placeFloorStain(g, "mold", 0.6, 0.5, 0.4, tile, 147);
    placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
  },

  attic: (g, _t, tile) => {
    place(g, crate(0.45), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
    place(g, crate(0.35), -(tile / 2 - 0.55), -(tile / 2 - 1.2), tile);
    place(g, crate(0.4), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    place(g, rockingChair(0x5a4636), tile / 2 - 0.7, -(tile / 2 - 0.9), tile, -Math.PI / 1.4);
    place(g, barrel(), tile / 2 - 0.6, 0.2, tile);
    // rafters across the ceiling
    for (let i = -1; i <= 1; i++) {
      const beam = box(tile - 0.4, 0.1, 0.12, 0x3a2a1c);
      beam.position.set(0, WALL_H - 0.15, i * 0.9);
      g.add(beam);
    }
    // cobwebs in the corners
    placeOnWall(g, cobwebFunnel(0.7), "n", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, cobwebFunnel(0.6), "s", tile / 2 - 0.6, WALL_H - 0.4, tile);
    // forgotten junk under the rafters: a sheeted portrait, debris and dust
    placeOnWall(g, framedPortrait(0.5, 0.6), "w", 0, 1.3, tile);
    g.add(debrisPlank(7, 1.4, 0x3a2a1c, 151));
    place(g, dustPile(0.18, 0x4a4238), 0, tile / 2 - 0.7, tile);
    place(g, dustPile(0.14, 0x4a4238), -(tile / 2 - 0.7), 0.4, tile);
    g.add(rats(3, 1.4, 153));
    placeFloorStain(g, "water", 0.5, 0.5, -0.5, tile, 155);
    // a strand of web drooping between two rafters
    const strand = cobwebStrand(0.9);
    strand.position.set(0, WALL_H - 0.25, 0);
    g.add(strand);
  },

  "entrance-hall": (g, t, tile) => {
    place(g, rug(1.2, tile - 0.8, 0x5a2424, t.accent), 0, 0, tile);
    place(g, pillar(WALL_H, 0x6a6258), -(tile / 2 - 0.5), -(tile / 2 - 0.5), tile);
    place(g, pillar(WALL_H, 0x6a6258), tile / 2 - 0.5, -(tile / 2 - 0.5), tile);
    place(g, table(0.7, 0.35, 0.55), 0, -(tile / 2 - 0.6), tile);
    place(g, drippingCandle(0.22, 0xe8dcc0, t.accent), 0, -(tile / 2 - 0.6) + 0.05, tile);
    placeOnWall(g, framedPortrait(0.6, 0.8), "n", 0, 1.6, tile);
    // grand decay: leaves and dust blown in, a creeping stain, webs and a crack
    g.add(scatteredPaper(6, 1.4, 181));
    place(g, dustPile(0.18, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    placeFloorStain(g, "water", 0.6, -(tile / 2 - 0.8), tile / 2 - 0.8, tile, 183);
    placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, cobwebFunnel(0.6), "e", tile / 2 - 0.6, WALL_H - 0.4, tile);
    placeOnWall(g, peelingWallpaper(0.5, 0.9, t.wall, t.floor), "s", tile / 2 - 0.7, 1.35, tile);
  },

  foyer: (g, t, tile) => {
    place(g, rug(1.4, 1.4, 0x4a2a4a, t.accent), 0, 0, tile);
    place(g, table(0.6, 0.4, 0.55), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
    place(g, drippingCandle(0.22, 0xe8dcc0, t.accent), -(tile / 2 - 0.7), -(tile / 2 - 0.7) + 0.05, tile);
    g.add(chandelier(t.accent));
    placeOnWall(g, framedPortrait(0.5, 0.65), "e", 0, 1.5, tile);
    placeOnWall(g, framedPortrait(0.5, 0.65), "w", 0, 1.5, tile);
    // mildewed grandeur: a torn curtain, dust, scattered paper, webs, a stain
    placeOnWall(g, tornCurtain(0.6, 1.2, 0x3a2a4a), "n", 0.5, WALL_H / 2 + 0.1, tile);
    place(g, dustPile(0.16, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    g.add(scatteredPaper(6, 1.3, 191));
    placeFloorStain(g, "mold", 0.5, 0.6, -0.6, tile, 193);
    placeOnWall(g, cobwebFunnel(0.6), "s", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(1.0, 195) as unknown as THREE.Object3D, "n", -0.4, 1.5, tile);
  },

  "grand-staircase": (g, t, tile) => {
    place(g, staircase(), 0, 0.2, tile);
    placeOnWall(g, framedPortrait(0.5, 0.65), "w", 0.4, 1.6, tile);
    placeOnWall(g, sconce(t.accent), "e", -0.4, 1.5, tile);
    placeOnWall(g, sconce(t.accent), "e", 0.4, 1.5, tile);
    place(g, rug(1.0, 1.2, 0x5a2424, t.accent), 0, tile / 2 - 0.8, tile);
    // splintered banister, fallen portraits and cobwebbed corners
    g.add(debrisPlank(6, 1.1, 0x3a2a18, 201));
    placeOnWall(g, framedPortrait(0.4, 0.5, 0x4a3826, 0x241f26), "w", -0.5, 1.0, tile);
    place(g, dustPile(0.16, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    placeFloorStain(g, "water", 0.5, -(tile / 2 - 0.8), tile / 2 - 0.8, tile, 203);
    placeOnWall(g, cobwebFunnel(0.7), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(1.1, 205) as unknown as THREE.Object3D, "e", -0.5, 1.6, tile);
  },

  "portrait-gallery": (g, t, tile) => {
    placeOnWall(g, framedPortrait(0.5, 0.65), "n", -0.7, 1.5, tile);
    placeOnWall(g, framedPortrait(0.5, 0.65), "n", 0.0, 1.5, tile);
    placeOnWall(g, framedPortrait(0.5, 0.65), "n", 0.7, 1.5, tile);
    placeOnWall(g, framedPortrait(0.5, 0.65, 0x5a4326, 0x322838), "s", -0.7, 1.5, tile);
    placeOnWall(g, framedPortrait(0.5, 0.65, 0x5a4326, 0x322838), "s", 0.7, 1.5, tile);
    placeOnWall(g, sconce(t.accent), "w", -0.5, 1.5, tile);
    placeOnWall(g, sconce(t.accent), "w", 0.5, 1.5, tile);
    place(g, rug(0.9, tile - 0.8, 0x4a3320, t.accent), 0, 0, tile);
    // one portrait has fallen and shattered; its frame lies cracked on the floor
    place(g, framedPortrait(0.4, 0.5, 0x4a3826, 0x241f26), -(tile / 2 - 0.7), tile / 2 - 0.6, tile, 0.6);
    g.add(glassShards(8, 1.0, 211));
    placeFloorStain(g, "water", 0.5, tile / 2 - 0.8, -0.5, tile, 213);
    placeOnWall(g, cobwebFunnel(0.6), "e", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(0.9, 215) as unknown as THREE.Object3D, "n", -0.35, 1.0, tile);
  },

  larder: (g, t, tile) => {
    placeOnWall(g, bookshelf(0.9, 1.3, 0x4a3422), "n", -0.55, 0, tile);
    placeOnWall(g, bookshelf(0.9, 1.3, 0x4a3422), "n", 0.55, 0, tile);
    place(g, barrel(), -(tile / 2 - 0.6), tile / 2 - 0.6, tile);
    place(g, barrel(), tile / 2 - 0.6, tile / 2 - 0.6, tile);
    place(g, crate(0.35), 0, tile / 2 - 0.6, tile);
    // hanging sausages/meat (cylinders)
    for (let i = 0; i < 3; i++) {
      const m = cyl(0.05, 0.04, 0.3, 0x6a3a2a, 8, { rough: 0.8 });
      placeOnWall(g, m, "w", -0.5 + i * 0.4, WALL_H - 0.4, tile);
    }
    // dark unlabeled jars (the flavor) + shared grime kit (rats, mold, chains)
    place(g, bottlesAndJars(8, 0.55, 91), -(tile / 2 - 0.6), -(tile / 2 - 0.7), tile);
    grimeKit(g, t, tile, 90);
    placeOnWall(g, cobwebFunnel(0.5), "e", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
  },

  "cold-cellar": (g, t, tile) => {
    place(g, barrel(), -(tile / 2 - 0.6), -(tile / 2 - 0.6), tile);
    place(g, barrel(), -(tile / 2 - 0.6), -(tile / 2 - 1.1), tile);
    place(g, barrel(), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
    place(g, crate(0.4), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    place(g, crate(0.3), 0, tile / 2 - 0.6, tile);
    placeOnWall(g, sconce(t.accent), "n", 0, 1.6, tile);
    // damp cold: a standing puddle, mossy jars, hanging chain, rats
    place(g, floorPuddle(0.4, 0x141c20), -0.4, 0.6, tile);
    place(g, bottlesAndJars(6, 0.45, 101), tile / 2 - 0.6, -(tile / 2 - 1.1), tile);
    placeOnWall(g, chain(0.7, 0x2a2622), "w", 0, WALL_H - 0.05, tile);
    placeOnWall(g, moldPatch(0.7, 103) as unknown as THREE.Object3D, "e", 0, 0.8, tile);
    g.add(rats(3, 1.3, 105));
    placeOnWall(g, cobwebFunnel(0.5), "s", tile / 2 - 0.6, WALL_H - 0.4, tile);
  },

  "mystic-elevator": (g, t, tile) => {
    // an ornate cage frame in the corners
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const post = cyl(0.05, 0.05, WALL_H - 0.1, 0x6a6e72, 8, { metal: 0.8, rough: 0.3 });
      post.position.set(clampInner(sx * (tile / 2 - 0.5), tile), (WALL_H - 0.1) / 2, clampInner(sz * (tile / 2 - 0.5), tile));
      g.add(post);
    }
    // glowing control panel
    const panel = box(0.3, 0.5, 0.1, 0x2a2e3a, { metal: 0.5, rough: 0.5 });
    placeOnWall(g, panel, "n", tile / 2 - 0.8, 1.1, tile);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), emissiveMat(t.accent, 1.2));
    placeOnWall(g, dial, "n", tile / 2 - 0.8, 1.2, tile);
    // an iron cage gone to rust: hanging chains, a worn rug and clinging webs
    placeOnWall(g, chain(1.6, 0x2a2826), "s", -0.6, WALL_H - 0.05, tile);
    placeOnWall(g, chain(1.4, 0x2a2826), "s", 0.6, WALL_H - 0.05, tile);
    place(g, rug(1.4, 1.4, 0x2a2e3a, t.accent), 0, 0, tile);
    placeFloorStain(g, "soot", 0.5, -0.4, 0.4, tile, 171);
    placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, cobwebFunnel(0.5), "e", tile / 2 - 0.6, WALL_H - 0.4, tile);
    placeOnWall(g, wallCrack(0.9, 173) as unknown as THREE.Object3D, "w", 0.2, 1.4, tile);
    const light = new THREE.PointLight(t.accent, t.accentIntensity, 3.0, 2);
    light.position.set(0, 1.6, 0);
    g.add(light);
  },

  "upper-landing": (g, t, tile) => {
    place(g, rug(1.0, tile - 0.8, 0x3a3a5a, t.accent), 0, 0, tile);
    place(g, table(0.6, 0.35, 0.55), -(tile / 2 - 0.7), 0, tile, Math.PI / 2);
    place(g, drippingCandle(0.2, 0xe8dcc0, t.accent), -(tile / 2 - 0.7), 0.05, tile);
    placeOnWall(g, framedPortrait(0.5, 0.6), "n", 0, 1.5, tile);
    placeOnWall(g, sconce(t.accent), "e", 0, 1.5, tile);
    // those creaking boards: warped planks, dust and webbed corners
    g.add(debrisPlank(5, 1.2, 0x3a322a, 221));
    place(g, dustPile(0.16, t.floor + 0x080808), tile / 2 - 0.7, tile / 2 - 0.7, tile);
    placeFloorStain(g, "water", 0.5, tile / 2 - 0.8, -0.5, tile, 223);
    placeOnWall(g, cobwebFunnel(0.6), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    placeOnWall(g, peelingWallpaper(0.5, 0.8, t.wall, t.floor), "s", 0, 1.3, tile);
    placeOnWall(g, wallCrack(0.9, 225) as unknown as THREE.Object3D, "e", -0.4, 1.4, tile);
  },

  "basement-landing": (g, t, tile) => {
    place(g, crate(0.4), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
    place(g, barrel(), tile / 2 - 0.6, -(tile / 2 - 0.6), tile);
    placeOnWall(g, sconce(t.accent), "n", 0, 1.6, tile);
    place(g, rug(0.9, tile - 1.0, 0x3a352e, t.accent), 0, 0.2, tile);
    placeOnWall(g, cobwebFunnel(0.5), "w", -(tile / 2 - 0.6), WALL_H - 0.4, tile);
    // wet stone tasting of old pennies: a puddle, mold, rats and rubble
    place(g, floorPuddle(0.38, 0x141c20), 0.4, tile / 2 - 0.8, tile);
    placeOnWall(g, moldPatch(0.7, 231) as unknown as THREE.Object3D, "e", 0, 0.8, tile);
    g.add(rats(3, 1.3, 233));
    g.add(rubblePile(7, 0.6, t.wall, 235));
    place(g, bottlesAndJars(5, 0.4, 237), tile / 2 - 0.6, tile / 2 - 0.6, tile);
    placeOnWall(g, chain(0.6, 0x2a2622), "n", -0.6, WALL_H - 0.05, tile);
  },
};

/** Generic runner-style corridor/hallway dressing used for several rooms. */
function dressCorridor(g: THREE.Group, t: RoomTheme, tile: number, seed = 1): void {
  place(g, rug(0.9, tile - 0.4, 0x5a2424, t.accent), 0, 0, tile);
  placeOnWall(g, sconce(t.accent), "w", -0.5, 1.5, tile);
  placeOnWall(g, sconce(t.accent), "e", 0.5, 1.5, tile);
  placeOnWall(g, framedPortrait(0.45, 0.6), "n", 0, 1.5, tile);
  // shared decay kit: cobwebbed corners, crack, peeling paper, dust, a stain
  decayKit(g, t, tile, seed);
}

COMPOSERS["dusty-hallway"] = (g, t, tile) => {
  dressCorridor(g, t, tile, 301);
  // decades of undisturbed dust and footprints
  place(g, dustPile(0.16, t.floor + 0x080808), 0, tile / 2 - 0.7, tile);
  g.add(scatteredPaper(6, 1.3, 303));
};
COMPOSERS["creaking-corridor"] = (g, t, tile) => {
  dressCorridor(g, t, tile, 311);
  place(g, crate(0.3), -(tile / 2 - 0.6), tile / 2 - 0.6, tile);
  // warped, snapped floorboards (the source of the creak)
  g.add(debrisPlank(6, 1.3, 0x3a322a, 313));
  g.add(rats(3, 1.3, 315));
};

/** Generic tasteful dressing for unknown rooms: rug + candlestick + crate + decay. */
function dressGeneric(g: THREE.Group, t: RoomTheme, tile: number): void {
  place(g, rug(1.4, 1.4, 0x4a3a2c, t.accent), 0, 0, tile);
  place(g, drippingCandle(0.22, 0xe8dcc0, t.accent), -(tile / 2 - 0.7), -(tile / 2 - 0.7), tile);
  place(g, crate(0.38), tile / 2 - 0.7, tile / 2 - 0.7, tile);
  placeOnWall(g, framedPortrait(0.45, 0.55), "n", 0, 1.5, tile);
  decayKit(g, t, tile, 321);
}

/**
 * Build the themed decoration props for a room as a single THREE.Group.
 * Returns a group that is always non-empty.
 */
export function buildRoomDecor(roomId: string, tile = 4): THREE.Group {
  const group = new THREE.Group();
  group.name = `decor:${roomId}`;
  const theme = roomTheme(roomId);
  const composer = COMPOSERS[roomId] ?? dressGeneric;
  composer(group, theme, tile);
  return group;
}

// ---------------------------------------------------------------------------
// Character figures
// ---------------------------------------------------------------------------

/**
 * A little explorer figure tinted by `colorHex` (head + torso), with a head,
 * torso, two arms, two legs, and a thin glowing base disc. Origin at the feet
 * (y = 0 at the bottom); roughly 1.4 units tall.
 */
export function buildExplorerFigure(colorHex: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "figure:explorer";

  const tint = new THREE.Color(colorHex);
  const bodyMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6, metalness: 0.05 });
  const limbMat = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.7), roughness: 0.7, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: tint.clone().lerp(new THREE.Color(0xe8c9a0), 0.45), roughness: 0.6 });

  // glowing base disc
  const baseGlow = new THREE.Color(colorHex).lerp(new THREE.Color(0xffffff), 0.3);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.34, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: baseGlow, emissive: baseGlow, emissiveIntensity: 0.9, roughness: 0.4 })
  );
  base.position.y = 0.02;
  g.add(base);

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

  // arms
  const armH = 0.4;
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, armH, 10), bodyMat);
    arm.position.set(sx * 0.26, torsoY + 0.05, 0);
    arm.rotation.z = sx * 0.18;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin);
    hand.position.set(sx * 0.31, torsoY - armH / 2 + 0.02, 0);
    g.add(hand);
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

  return g;
}

/**
 * A menacing monster figure: dark, irregular/spiky, with faint red emissive
 * accents (eyes + glow). Origin at the feet (y = 0); roughly 1.4 units tall.
 * The `name` seeds small deterministic variation in the silhouette.
 */
export function buildMonsterFigure(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `figure:monster:${name}`;

  // deterministic seed from the name
  let seed = 0;
  for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x14110f, roughness: 0.9, metalness: 0.1 });
  const spikeMat = () => new THREE.MeshStandardMaterial({ color: 0x0e0c0a, roughness: 0.85, metalness: 0.15 });
  const emberMat = (i = 0.9) => new THREE.MeshStandardMaterial({ color: 0xaa1414, emissive: 0xff1a1a, emissiveIntensity: i, roughness: 0.5 });

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

  return g;
}
