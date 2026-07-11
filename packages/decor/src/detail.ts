import * as THREE from "three";

/**
 * @dread-hollow/decor — haunted detailing helpers
 *
 * Small procedural primitives that make rooms feel lived-in and decaying:
 * peeling wallpaper, cracks, stains, cobwebs, scattered debris, vermin, bones,
 * broken furniture, etc.
 *
 * Conventions (mirrors index.ts):
 *  - Floor TOP surface is at y = 0; ceiling/wall top is WALL_H = 3.2.
 *  - Props are built from THREE primitives only. No external assets.
 *  - FRESH materials/geometries per call — callers dispose per room, so NO
 *    module-level shared material/geometry instances.
 *  - Decals are thin planes nudged off their surface with `polygonOffset`
 *    + a tiny positional offset to avoid z-fighting; transparent decals set
 *    `depthWrite:false`.
 *  - Props that appear many times in a room are built as a single
 *    `THREE.InstancedMesh` (one geometry + one material, disposed by the
 *    caller) via the `instanced()` helper.
 */

export const WALL_H = 3.2;

// ---------------------------------------------------------------------------
// Local material / primitive helpers (fresh per call)
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

/** A candle-flame teardrop (lathe profile, center-anchored like ConeGeometry
 *  so it drops in where cones used to sit). Bare cones read as "glowing
 *  triangles" the moment a first-person eye gets close; this reads as flame
 *  from any distance — same emissive material, no new shader programs. */
function flameGeometry(r: number, h: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.0001, 0),
    new THREE.Vector2(r * 0.55, h * 0.06),
    new THREE.Vector2(r, h * 0.28),
    new THREE.Vector2(r * 0.62, h * 0.6),
    new THREE.Vector2(r * 0.22, h * 0.86),
    new THREE.Vector2(0.0001, h),
  ];
  const geo = new THREE.LatheGeometry(pts, 10);
  geo.translate(0, -h / 2, 0); // center-anchored, drop-in for ConeGeometry
  return geo;
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

/**
 * A flat translucent decal material (water/blood/mold/soot stains, puddles).
 * `depthWrite:false` + `polygonOffset` keeps it from z-fighting the surface
 * it is laid against.
 */
function decalMat(color: number, opacity: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -1;
  return m;
}

/** A tiny deterministic PRNG so a given seed always produces the same clutter. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ---------------------------------------------------------------------------
// Instancing
// ---------------------------------------------------------------------------

/**
 * Build a single `THREE.InstancedMesh` from one geometry + one material and a
 * list of per-instance transforms. Dispose-safe: the caller disposes the one
 * geometry and the one material when clearing the room (exactly like any other
 * mesh in the group), and every instance is freed with them.
 *
 * Use for any prop that appears more than ~6 times in a room (papers, shards,
 * rats, rubble, bottles, cracks, stains, bone piles).
 */
export function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: Array<{
    pos: [number, number, number];
    rot?: [number, number, number];
    scale?: number | [number, number, number];
    /** Optional per-instance tint (multiplied with the material color). */
    color?: number;
  }>
): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geometry, material, transforms.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  transforms.forEach((t, i) => {
    p.set(t.pos[0], t.pos[1], t.pos[2]);
    const r = t.rot ?? [0, 0, 0];
    e.set(r[0], r[1], r[2]);
    q.setFromEuler(e);
    if (typeof t.scale === "number") s.set(t.scale, t.scale, t.scale);
    else if (Array.isArray(t.scale)) s.set(t.scale[0], t.scale[1], t.scale[2]);
    else s.set(1, 1, 1);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
    if (t.color !== undefined) im.setColorAt(i, c.set(t.color));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  return im;
}

// ---------------------------------------------------------------------------
// Wall / surface decay decals
// ---------------------------------------------------------------------------

/**
 * A strip of wallpaper peeling away from a wall: a flat backing panel with a
 * curled flap drooping off the bottom. Built to hang on a wall (face +z) so it
 * works with `placeOnWall`.
 */
export function peelingWallpaper(w = 0.6, h = 0.9, color = 0x6a5a48, under = 0x3a2f26): THREE.Group {
  const g = new THREE.Group();
  // exposed plaster/lath behind the paper
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(under, { rough: 1 }));
  wall.position.z = 0.005;
  g.add(wall);
  // the paper still clinging to the top two-thirds
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.62), decalMat(color, 0.95));
  paper.position.set(0, h * 0.19, 0.012);
  g.add(paper);
  // a curled flap peeling downward/forward
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, h * 0.3), decalMat(color, 0.9));
  flap.position.set(w * 0.05, -h * 0.18, 0.06);
  flap.rotation.x = 0.7;
  g.add(flap);
  const flap2 = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.3, h * 0.22), decalMat(color, 0.85));
  flap2.position.set(-w * 0.28, -h * 0.05, 0.05);
  flap2.rotation.x = 0.5;
  flap2.rotation.z = 0.3;
  g.add(flap2);
  return g;
}

/**
 * A jagged crack spidering across a wall. Returns ONE InstancedMesh of thin
 * dark splinters (since a crack is many segments) so it stays cheap.
 */
export function wallCrack(len = 0.9, seed = 1): THREE.InstancedMesh {
  const r = rand(seed);
  const segs = 7 + Math.floor(r() * 4);
  const transforms: Array<{ pos: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] }> = [];
  let x = -len / 2;
  let y = -len * 0.25;
  // A real crack keeps a heading and thins as it runs — the old alternating
  // ±0.5rad sawtooth at full width/opacity read as a bold zigzag scribble at
  // first-person eye height (these hang at y≈1.4-1.6 on many walls).
  let ang = (r() - 0.5) * 0.6 + 0.15;
  for (let i = 0; i < segs; i++) {
    const sl = (len / segs) * (0.7 + r() * 0.8);
    ang += (r() - 0.5) * 0.45;
    transforms.push({
      pos: [x + Math.cos(ang) * sl * 0.5, y + Math.sin(ang) * sl * 0.5, 0.01],
      rot: [0, 0, ang],
      scale: [sl, 1.4 - (i / segs) * 1.05, 1],
    });
    x += Math.cos(ang) * sl;
    y += Math.sin(ang) * sl;
  }
  const geo = new THREE.PlaneGeometry(1, 0.012);
  const m = decalMat(0x0a0806, 0.5);
  return instanced(geo, m, transforms);
}

/**
 * A surface stain decal — a soft irregular blotch built from a few overlapping
 * circles. `kind` picks the tint: water / blood / mold / soot. Flat plane on
 * face +z (use on wall or rotate -PI/2 for the floor).
 */
export function stainDecal(kind: "water" | "blood" | "mold" | "soot" = "water", size = 0.5, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const tint = { water: 0x3a4248, blood: 0x4a0e0e, mold: 0x39432a, soot: 0x141210 }[kind];
  const opacity = { water: 0.4, blood: 0.6, mold: 0.55, soot: 0.6 }[kind];
  const r = rand(seed);
  const blobs = 3 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const rad = size * (0.3 + r() * 0.35);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(rad, 14), decalMat(tint, opacity * (0.7 + r() * 0.3)));
    blob.position.set((r() - 0.5) * size * 0.7, (r() - 0.5) * size * 0.7, 0.008 + i * 0.001);
    g.add(blob);
  }
  return g;
}

/** A patch of mottled mold — overlapping greenish-black blotches on a surface. */
export function moldPatch(size = 0.5, seed = 1): THREE.Group {
  return stainDecal("mold", size, seed);
}

/**
 * Three or four parallel gouges — claw marks raked across a surface. ONE
 * InstancedMesh of thin grooves. Built on face +z.
 */
export function clawMarks(len = 0.5, count = 4, seed = 1): THREE.InstancedMesh {
  const r = rand(seed);
  const transforms: Array<{ pos: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] }> = [];
  const skew = (r() - 0.5) * 0.4;
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 0.06;
    transforms.push({
      pos: [off, (r() - 0.5) * 0.05, 0.01],
      rot: [0, 0, Math.PI / 2 + skew + (r() - 0.5) * 0.12],
      scale: [len * (0.8 + r() * 0.4), 1, 1],
    });
  }
  const geo = new THREE.PlaneGeometry(1, 0.02);
  return instanced(geo, decalMat(0x161210, 0.85), transforms);
}

// ---------------------------------------------------------------------------
// Cobwebs
// ---------------------------------------------------------------------------

/**
 * A funnel cobweb tucked into a corner — concentric rings + radial threads on
 * a translucent plane (face +z). Denser, more web-like than the flat `cobweb`.
 */
export function cobwebFunnel(size = 0.6): THREE.Group {
  const g = new THREE.Group();
  const webMat = () =>
    new THREE.MeshStandardMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.14, roughness: 1, side: THREE.DoubleSide, depthWrite: false });
  // backing sheet
  const sheet = new THREE.Mesh(new THREE.CircleGeometry(size * 0.5, 12), webMat());
  g.add(sheet);
  // concentric rings — ONE instanced unit torus, scaled per ring (rooms hang
  // four or more funnels, so each must stay a 3-object prop)
  const ringT = [1, 2, 3].map((i) => ({
    pos: [0, 0, 0.002 * i] as [number, number, number],
    scale: [i, i, 1] as [number, number, number],
  }));
  g.add(instanced(new THREE.TorusGeometry(size * 0.16, 0.004, 4, 16), webMat(), ringT));
  // radial spokes — ONE instanced thin box
  const spokeT = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return {
      pos: [Math.cos(a) * size * 0.25, Math.sin(a) * size * 0.25, 0.001] as [number, number, number],
      rot: [0, 0, a] as [number, number, number],
    };
  });
  g.add(instanced(new THREE.BoxGeometry(size * 0.5, 0.004, 0.002), webMat(), spokeT));
  return g;
}

/** A single drooping cobweb strand hanging between two points (thin sagging line). */
export function cobwebStrand(len = 0.5): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-len / 2, 0, 0),
    new THREE.Vector3(0, -len * 0.18, 0),
    new THREE.Vector3(len / 2, 0, 0),
  ]);
  const geo = new THREE.TubeGeometry(curve, 8, 0.003, 4, false);
  const m = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.2, roughness: 1, depthWrite: false });
  return new THREE.Mesh(geo, m);
}

// ---------------------------------------------------------------------------
// Floor clutter (instanced)
// ---------------------------------------------------------------------------

/** `n` sheets of scattered paper strewn on the floor. ONE InstancedMesh. */
export function scatteredPaper(n = 8, spread = 1.1, seed = 1): THREE.InstancedMesh {
  const r = rand(seed);
  const transforms: Array<{ pos: [number, number, number]; rot?: [number, number, number]; scale?: number }> = [];
  for (let i = 0; i < n; i++) {
    transforms.push({
      pos: [(r() - 0.5) * spread, 0.006 + i * 0.0008, (r() - 0.5) * spread],
      rot: [-Math.PI / 2, 0, r() * Math.PI],
      scale: 0.7 + r() * 0.6,
    });
  }
  const geo = new THREE.PlaneGeometry(0.16, 0.22);
  return instanced(geo, decalMat(0xcfc6b0, 0.95), transforms);
}

/** `n` glass shards scattered on the floor (sharp little glints). ONE InstancedMesh. */
export function glassShards(n = 10, spread = 0.9, seed = 1): THREE.InstancedMesh {
  const r = rand(seed);
  const transforms: Array<{ pos: [number, number, number]; rot?: [number, number, number]; scale?: number }> = [];
  for (let i = 0; i < n; i++) {
    transforms.push({
      pos: [(r() - 0.5) * spread, 0.012, (r() - 0.5) * spread],
      rot: [0, r() * Math.PI, (r() - 0.5) * 0.4],
      scale: 0.6 + r() * 0.8,
    });
  }
  const geo = new THREE.TetrahedronGeometry(0.04);
  const m = new THREE.MeshStandardMaterial({ color: 0xaecad0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.6 });
  return instanced(geo, m, transforms);
}

/** A low conical pile of dust/grime on the floor. */
export function dustPile(radius = 0.18, color = 0x4a4238): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 0.4, 12), mat(color, { rough: 1 }));
  m.position.y = radius * 0.2;
  return m;
}

/** `n` chunks of fallen rubble/masonry. ONE InstancedMesh of dodecahedra. */
export function rubblePile(n = 8, spread = 0.6, color = 0x5a534a, seed = 1): THREE.InstancedMesh {
  const r = rand(seed);
  const transforms: Array<{ pos: [number, number, number]; rot?: [number, number, number]; scale?: number }> = [];
  for (let i = 0; i < n; i++) {
    const s = 0.05 + r() * 0.08;
    transforms.push({
      pos: [(r() - 0.5) * spread, s * 0.6, (r() - 0.5) * spread],
      rot: [r() * Math.PI, r() * Math.PI, r() * Math.PI],
      scale: s / 0.06,
    });
  }
  const geo = new THREE.DodecahedronGeometry(0.06, 0);
  return instanced(geo, mat(color, { rough: 1 }), transforms);
}

// ---------------------------------------------------------------------------
// Vermin & bones
// ---------------------------------------------------------------------------

/** `n` little rats (instanced bodies) plus a thin tail-suggesting scatter. */
export function rats(n = 4, spread = 1.0, seed = 1): THREE.InstancedMesh {
  const r = rand(seed);
  const transforms: Array<{ pos: [number, number, number]; rot?: [number, number, number]; scale?: number }> = [];
  for (let i = 0; i < n; i++) {
    transforms.push({
      pos: [(r() - 0.5) * spread, 0.04, (r() - 0.5) * spread],
      rot: [0, r() * Math.PI * 2, 0],
      scale: 0.8 + r() * 0.5,
    });
  }
  // a squashed sphere reads as a crouched rat body at this scale
  const geo = new THREE.SphereGeometry(0.05, 8, 6);
  geo.scale(1.8, 0.8, 1.0);
  return instanced(geo, mat(0x2a2622, { rough: 0.9 }), transforms);
}

/** A single skull (cranium + jaw + dark eye sockets). */
export function skull(scale = 1, color = 0xd8d0c0): THREE.Group {
  const g = new THREE.Group();
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), mat(color, { rough: 0.9 }));
  g.add(cranium);
  const jaw = box(0.07, 0.035, 0.06, color, { rough: 0.9 });
  jaw.position.set(0, -0.05, 0.015);
  g.add(jaw);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), mat(0x0a0806, { rough: 1 }));
    eye.position.set(sx * 0.025, 0.005, 0.05);
    g.add(eye);
  }
  g.scale.setScalar(scale);
  return g;
}

/**
 * A heap of `n` bones (instanced) with a couple of real skulls on top. The
 * many long bones are one InstancedMesh; skulls are added as groups.
 */
export function bonePile(n = 10, spread = 0.5, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rand(seed);
  const transforms: Array<{ pos: [number, number, number]; rot?: [number, number, number]; scale?: number }> = [];
  for (let i = 0; i < n; i++) {
    transforms.push({
      pos: [(r() - 0.5) * spread, 0.03 + r() * 0.08, (r() - 0.5) * spread],
      rot: [(r() - 0.5) * 0.4, r() * Math.PI, Math.PI / 2 + (r() - 0.5) * 0.5],
      scale: 0.7 + r() * 0.6,
    });
  }
  const geo = new THREE.CylinderGeometry(0.018, 0.022, 0.22, 6);
  g.add(instanced(geo, mat(0xcfc6b0, { rough: 0.9 }), transforms));
  const s1 = skull(0.9);
  s1.position.set((r() - 0.5) * spread * 0.5, 0.12, (r() - 0.5) * spread * 0.5);
  s1.rotation.y = r() * Math.PI;
  g.add(s1);
  return g;
}

// ---------------------------------------------------------------------------
// Storage / service clutter
// ---------------------------------------------------------------------------

/** `n` bottles and jars huddled together (instanced bodies + instanced necks). */
export function bottlesAndJars(n = 7, spread = 0.5, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rand(seed);
  const bodyT: Array<{ pos: [number, number, number]; scale?: [number, number, number] }> = [];
  const neckT: Array<{ pos: [number, number, number] }> = [];
  for (let i = 0; i < n; i++) {
    const px = (r() - 0.5) * spread;
    const pz = (r() - 0.5) * spread;
    const hs = 0.7 + r() * 0.8;
    bodyT.push({ pos: [px, 0.07 * hs, pz], scale: [0.7 + r() * 0.5, hs, 0.7 + r() * 0.5] });
    neckT.push({ pos: [px, 0.15 * hs, pz] });
  }
  const tints = [0x2a4a3a, 0x3a3a4a, 0x4a3a2a, 0x2a3a4a];
  const bodyGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.14, 8);
  g.add(instanced(bodyGeo, mat(tints[seed % tints.length], { rough: 0.4, metal: 0.1 }), bodyT));
  const neckGeo = new THREE.CylinderGeometry(0.013, 0.02, 0.05, 6);
  g.add(instanced(neckGeo, mat(tints[(seed + 1) % tints.length], { rough: 0.4, metal: 0.1 }), neckT));
  return g;
}

/** A hanging chain of `len` torus links (ONE InstancedMesh — chains get long). */
export function chain(len = 0.6, color = 0x33302c): THREE.Group {
  const g = new THREE.Group();
  const links = Math.max(2, Math.round(len / 0.06));
  const t = Array.from({ length: links }, (_, i) => ({
    pos: [0, -i * 0.05, 0] as [number, number, number],
    rot: [0, (i % 2) * (Math.PI / 2), 0] as [number, number, number],
  }));
  g.add(instanced(new THREE.TorusGeometry(0.025, 0.008, 6, 10), mat(color, { metal: 0.7, rough: 0.5 }), t));
  return g;
}

// ---------------------------------------------------------------------------
// Lighting props (emissive — no real lights here)
// ---------------------------------------------------------------------------

/** A guttering, half-melted candle with frozen wax drips and a flame. */
export function drippingCandle(height = 0.2, color = 0xe8dcc0, flame = 0xffae3a): THREE.Group {
  const g = new THREE.Group();
  const stick = cyl(0.028, 0.034, height, color, 8, { rough: 0.7 });
  stick.position.y = height / 2;
  stick.rotation.z = 0.06;
  g.add(stick);
  // frozen wax drips down the side
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.012 + (i % 2) * 0.006, 6, 6), mat(color, { rough: 0.6 }));
    drip.position.set(Math.cos(a) * 0.03, height * (0.3 + (i % 3) * 0.18), Math.sin(a) * 0.03);
    drip.scale.y = 2.2;
    g.add(drip);
  }
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), mat(color, { rough: 0.6 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.004;
  g.add(pool);
  const f = new THREE.Mesh(flameGeometry(0.03, 0.09), emissiveMat(flame, 1.6));
    f.userData.flame = Math.random() * Math.PI * 2;
  f.position.y = height + 0.04;
  g.add(f);
  return g;
}

// ---------------------------------------------------------------------------
// Furnishings (broken / decayed)
// ---------------------------------------------------------------------------

/** A framed portrait with a darkened, water-damaged canvas (hangs on a wall). */
export function framedPortrait(w = 0.5, h = 0.65, frame = 0x4a3826, canvas = 0x241f26): THREE.Group {
  const g = new THREE.Group();
  const f = box(w, h, 0.05, frame, { metal: 0.3, rough: 0.6 });
  g.add(f);
  const c = box(w * 0.82, h * 0.82, 0.02, canvas, { rough: 0.95 });
  c.position.z = 0.03;
  g.add(c);
  // a pale ghost of a face/figure on the canvas
  const figure = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.34, h * 0.5), decalMat(0x6a6068, 0.5));
  figure.position.set(0, h * 0.04, 0.045);
  g.add(figure);
  const head = new THREE.Mesh(new THREE.CircleGeometry(w * 0.12, 12), decalMat(0x7a7078, 0.5));
  head.position.set(0, h * 0.22, 0.046);
  g.add(head);
  // a soot/water blotch creeping up a corner (a single decal — the big rooms
  // hang half a dozen portraits, so each must stay cheap)
  const blot = new THREE.Mesh(new THREE.CircleGeometry(w * 0.22, 10), decalMat(0x3a4248, 0.4));
  blot.position.set(-w * 0.25, -h * 0.2, 0.05);
  g.add(blot);
  return g;
}

/** A tattered curtain hanging on a wall (face +z), with ragged vertical tears. */
export function tornCurtain(w = 0.6, h = 1.3, color = 0x4a2a2e): THREE.Group {
  const g = new THREE.Group();
  // a rod
  const rod = cyl(0.015, 0.015, w + 0.1, 0x3a2a1c, 6, { metal: 0.4 });
  rod.rotation.z = Math.PI / 2;
  rod.position.y = h / 2;
  g.add(rod);
  // hanging panels of varying length (the "tatters")
  const panels = 5;
  for (let i = 0; i < panels; i++) {
    const pw = w / panels;
    const ph = h * (0.6 + ((i * 3) % 5) * 0.08);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw * 0.92, ph), mat(color, { rough: 1 }));
    panel.position.set(-w / 2 + pw * (i + 0.5), h / 2 - ph / 2, 0.01 + i * 0.001);
    g.add(panel);
  }
  return g;
}

/** A toppled, broken chair — seat askew on the floor with splayed/snapped legs. */
export function brokenChair(color = 0x4a3320): THREE.Group {
  const g = new THREE.Group();
  const seat = box(0.34, 0.05, 0.34, color);
  seat.position.set(0, 0.06, 0);
  seat.rotation.z = 0.5;
  seat.rotation.y = 0.3;
  g.add(seat);
  // three legs at odd angles, one snapped off lying flat
  const legPoses: Array<[number, number, number, number, number]> = [
    [0.12, 0.12, 0.12, 0.2, 0],
    [-0.12, 0.1, -0.1, -0.3, 0.4],
    [0.1, 0.05, -0.12, 1.4, 0.2],
  ];
  for (const [x, y, z, rz, rx] of legPoses) {
    const leg = box(0.05, 0.3, 0.05, color);
    leg.position.set(x, y, z);
    leg.rotation.z = rz;
    leg.rotation.x = rx;
    g.add(leg);
  }
  const snapped = box(0.05, 0.26, 0.05, color);
  snapped.position.set(-0.25, 0.025, 0.15);
  snapped.rotation.z = Math.PI / 2;
  snapped.rotation.y = 0.6;
  g.add(snapped);
  // back, leaning broken
  const back = box(0.3, 0.3, 0.04, color);
  back.position.set(-0.14, 0.18, -0.14);
  back.rotation.z = 0.6;
  g.add(back);
  return g;
}

/** `n` fallen planks of wood debris scattered on the floor. ONE InstancedMesh. */
export function debrisPlank(n = 6, spread = 1.0, color = 0x3a2a1c, seed = 1): THREE.InstancedMesh {
  const r = rand(seed);
  const transforms: Array<{ pos: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] }> = [];
  for (let i = 0; i < n; i++) {
    transforms.push({
      pos: [(r() - 0.5) * spread, 0.02 + (i % 2) * 0.03, (r() - 0.5) * spread],
      rot: [(r() - 0.5) * 0.2, r() * Math.PI, (r() - 0.5) * 0.2],
      scale: [0.6 + r() * 0.8, 1, 0.7 + r() * 0.5],
    });
  }
  const geo = new THREE.BoxGeometry(0.5, 0.04, 0.08);
  return instanced(geo, mat(color, { rough: 0.95 }), transforms);
}

/**
 * A still, dark puddle on the floor — a flat reflective decal with a faint
 * lighter rim. Laid flat (lies in the XZ plane).
 */
export function floorPuddle(radius = 0.35, color = 0x14181c): THREE.Group {
  const g = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85, depthWrite: false })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.006;
  (water.material as THREE.MeshStandardMaterial).polygonOffset = true;
  (water.material as THREE.MeshStandardMaterial).polygonOffsetFactor = -1;
  (water.material as THREE.MeshStandardMaterial).polygonOffsetUnits = -1;
  g.add(water);
  const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.92, radius * 1.06, 20), decalMat(0x3a3630, 0.4));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.005;
  g.add(rim);
  return g;
}
