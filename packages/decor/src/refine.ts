import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Avatar realism pass for the six rigged CC0 explorers (Quaternius Ultimate
 * Modular humans). The source models are flat-shaded low-poly with named flat
 * colour materials and no textures; this module turns each into a "small
 * sculpted figure that reads as a living person":
 *
 *  - `refineExplorerAvatar(root, archetype)` — geometry smoothing (creased
 *    normals, cached once per source geometry), physically-grounded materials
 *    keyed by material name (skin sheen, wet eyes, real metal, per-fabric
 *    roughness), a per-character grooming table (skin tone, hair depth, cloth
 *    personality, build), plus painted-on eyelids hung from the head bone.
 *  - `attachAvatarLife(root, archetype)` — an additive "alive at idle" layer
 *    (breathing, head drift, blinks, relaxed fingers) applied AFTER the
 *    animation mixer each frame so the clips still win.
 *
 * Both frontends call these right after cloning + identity-tinting; the tint
 * that has already been applied to the clothes is preserved (materials are
 * restyled from their current colour, never repainted).
 */

// ---------------------------------------------------------------------------
// Grooming table — what makes each explorer read as a distinct person
// ---------------------------------------------------------------------------

interface ClothRule {
  rough?: number;
  /** Sheen strength (fabric back-scatter). */
  sheen?: number;
  /** Sheen colour override (defaults to a lightened base colour). */
  sheenColor?: number;
  clearcoat?: number;
  metal?: number;
  /** Micro-normal grain: [amplitude, frequency] in bind-space units. */
  grain?: [number, number];
}

interface Grooming {
  /** Skin is nudged toward this tone (sRGB), by `skinBlend`. */
  skinTone: number;
  skinBlend: number;
  /** Resting upper-eyelid coverage as a fraction of eye height. */
  restLid: number;
  /** Width/depth multipliers for the whole figure (1 = as modelled). */
  build?: [number, number];
  /** Constant additive posture (radians): chest pitch, head pitch, head roll. */
  posture?: [number, number, number];
  /** Breathing amplitude scale and rate scale (1 = default adult). */
  breath?: [number, number];
  /** Head-drift (attention) amplitude scale. */
  headDrift?: number;
  /** Cloth personality by material name. */
  cloth: Record<string, ClothRule>;
}

const LEATHER: ClothRule = { rough: 0.58, sheen: 0.18, clearcoat: 0.12, grain: [0.1, 70] };
const DENIM: ClothRule = { rough: 0.94, sheen: 0.12, grain: [0.14, 150] };
const COTTON: ClothRule = { rough: 0.9, sheen: 0.2, grain: [0.13, 190] };
const SILK: ClothRule = { rough: 0.44, sheen: 0.35, clearcoat: 0.06, grain: [0.06, 220] };
const CANVAS: ClothRule = { rough: 0.92, sheen: 0.14, grain: [0.14, 150] };
const STEEL: ClothRule = { metal: 0.85, rough: 0.42, grain: [0.06, 40] };
const GOLD: ClothRule = { metal: 0.85, rough: 0.32 };

const DEFAULT_GROOM: Grooming = {
  skinTone: 0xc08a62,
  skinBlend: 0.25,
  restLid: 0.12,
  cloth: {},
};

/** Per-explorer grooming. Material names are the glTF flat-colour names. */
const GROOM: Record<string, Grooming> = {
  // Silas Crow — carnival strongman: weathered tan, coarse denim overalls,
  // straw hat, a touch broader through the chest than the base body.
  crow: {
    skinTone: 0x9c6a42,
    skinBlend: 0.42,
    restLid: 0.1,
    build: [1.06, 1.04],
    posture: [0.02, 0.015, 0],
    breath: [1.25, 0.85],
    headDrift: 0.8,
    cloth: {
      LightBlue: DENIM, // overalls (identity-tinted earth brown)
      Brown: { rough: 0.88, sheen: 0.16, grain: [0.13, 170] }, // work shirt
      Beige: { rough: 1.0, sheen: 0.1, grain: [0.2, 110] }, // straw hat, cuffs
      Brown2: LEATHER, // boots
      Red: { rough: 0.82, sheen: 0.25, grain: [0.12, 200] }, // neckerchief
    },
  },
  // Dr. Mireille Vance — disgraced surgeon: clinical fair skin, crisp
  // low-roughness formal wear, narrow steady eyes, perfectly upright.
  vance: {
    skinTone: 0xd6ac8c,
    skinBlend: 0.4,
    restLid: 0.22,
    posture: [-0.02, -0.01, 0],
    breath: [0.8, 1.0],
    headDrift: 0.45,
    cloth: {
      Red: SILK, // dress (tinted grey-teal) — the head-mesh copy is her hair
      LimeGreen: { rough: 0.48, sheen: 0.3, grain: [0.07, 220] }, // skirt trim
      Gold: GOLD, // jewellery
    },
  },
  // Odette Lindqvist — séance medium: pale cool skin, silken violet dress,
  // black hair with depth, chin composed and slightly lifted.
  odette: {
    skinTone: 0xd9b49e,
    skinBlend: 0.45,
    restLid: 0.16,
    posture: [0, -0.03, 0],
    breath: [0.9, 0.9],
    headDrift: 0.6,
    cloth: {
      Purple: { rough: 0.46, sheen: 0.4, sheenColor: 0x9a7ec9, clearcoat: 0.05, grain: [0.06, 220] },
      Gold: GOLD, // trim
      Brown: { rough: 0.8, sheen: 0.16, grain: [0.11, 170] }, // under-layers (legs)
      Brown2: LEATHER, // boots
    },
  },
  // Brother Tobias — doubting monk in borrowed mail: olive ascetic skin,
  // aged steel, white hair; he carries a slight penitent stoop.
  tobias: {
    skinTone: 0xa07c50,
    skinBlend: 0.42,
    restLid: 0.18,
    posture: [0.05, 0.04, 0],
    breath: [1.0, 0.9],
    headDrift: 0.55,
    cloth: {
      Metal: STEEL,
      Metal_Dark: { metal: 0.85, rough: 0.52, grain: [0.07, 40] },
      Gold: GOLD, // crown
      Blue: { rough: 0.88, sheen: 0.14, grain: [0.13, 160] }, // habit cloth
      Beige: { rough: 0.85, sheen: 0.14, grain: [0.12, 160] },
      DarkBrown: LEATHER,
    },
  },
  // Marcus Thorne — war photographer: sun-worn ruddy skin, field canvas,
  // strapped leather, always watching — head a touch forward.
  thorne: {
    skinTone: 0xa8724a,
    skinBlend: 0.42,
    restLid: 0.15,
    posture: [0.015, 0.035, 0],
    breath: [1.05, 0.95],
    headDrift: 0.9,
    cloth: {
      Green: CANVAS, // field jacket
      LightGreen: { rough: 0.86, sheen: 0.16, grain: [0.12, 180] }, // shirt
      Brown: LEATHER, // straps, pack
      Brown2: LEATHER,
      Grey: { rough: 0.55, sheen: 0.1, grain: [0.08, 90] }, // boots
      Black: { rough: 0.9 }, // soles
      Gold: { metal: 0.8, rough: 0.35 }, // buckles
    },
  },
  // Penny Ashgrove — runaway child: warm young skin, wide eyes, soft cotton,
  // the liveliest idle of the six.
  penny: {
    skinTone: 0xe0a87e,
    skinBlend: 0.38,
    restLid: 0.06,
    posture: [0, 0, 0.02],
    breath: [1.1, 1.35],
    headDrift: 1.3,
    cloth: {
      White: COTTON, // t-shirt
      Orange: { rough: 0.95, sheen: 0.18, grain: [0.18, 140] }, // corduroy pants
      Grey: { rough: 0.8, grain: [0.1, 100] }, // sneakers
    },
  },
};

// ---------------------------------------------------------------------------
// Geometry smoothing — creased normals, computed once per SOURCE geometry
// ---------------------------------------------------------------------------

/** Crease angle: facets meeting flatter than this blend into a rounded form;
 *  sharper corners (hat brims, hems, armour edges) keep a crisp line. */
const CREASE = THREE.MathUtils.degToRad(56);

/** Source-geometry uuid -> smoothed geometry. Clones share geometry, so the
 *  cost is paid once per model file, not per avatar instance; mapping the
 *  refined uuid to itself makes the pass idempotent. */
const smoothCache = new Map<string, THREE.BufferGeometry>();

function smoothGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = smoothCache.get(geo.uuid);
  if (hit) return hit;
  let out: THREE.BufferGeometry;
  try {
    out = toCreasedNormals(geo, CREASE);
    out.computeBoundingBox();
    out.computeBoundingSphere();
  } catch {
    out = geo; // never let a malformed primitive break the avatar
  }
  smoothCache.set(geo.uuid, out);
  smoothCache.set(out.uuid, out);
  return out;
}

// ---------------------------------------------------------------------------
// Micro-detail — bind-space lattice normal perturbation (onBeforeCompile)
// ---------------------------------------------------------------------------

/** Inject a faint bind-space micro-normal lattice (fabric grain / skin
 *  unevenness) and, for hair, a vertical root→tip value gradient. Bind-space
 *  coordinates keep the grain glued to the surface through animation. Costs
 *  a few ALU ops; safe under SwiftShader (low amplitude, no derivatives). */
function addMicroDetail(
  mat: THREE.Material,
  amp: number,
  freq: number,
  hairSpan?: [number, number],
): void {
  // Every knob is a UNIFORM and the cache key a single constant: under
  // software WebGL each distinct program is a multi-second main-thread
  // compile, and the old per-mesh baked constants (hair even baked its
  // bounding box) compiled dozens of programs and wedged slow machines.
  const u = {
    dhAmp: { value: amp },
    dhFreq: { value: freq },
    dhGrad: { value: hairSpan ? 1 : 0 }, // root->tip gradient gate
    dhSpan: { value: new THREE.Vector2(hairSpan?.[0] ?? 0, hairSpan?.[1] ?? 1) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDhPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDhPos = position.xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vDhPos;\nuniform float dhAmp, dhFreq, dhGrad;\nuniform vec2 dhSpan;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, mix(0.78, 1.07, smoothstep(dhSpan.x, dhSpan.y, vDhPos.y)), dhGrad);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 dhp = vDhPos * dhFreq;
          vec3 dhg = vec3(
            sin(dhp.y + dhp.z * 0.71) * sin(dhp.z * 1.37),
            sin(dhp.z + dhp.x * 0.71) * sin(dhp.x * 1.37),
            sin(dhp.x + dhp.y * 0.71) * sin(dhp.y * 1.37));
          normal = normalize(normal + dhAmp * dhg);
        }`,
      );
  };
  mat.customProgramCacheKey = () => "dh-micro";
}

// ---------------------------------------------------------------------------
// Mesh classification
// ---------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function matName(m: THREE.Material): string {
  return m.name || "";
}

/** Is this mesh part of the head (any ancestor node named *_Head)? */
function inHead(o: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = o;
  while (cur) {
    if (/head/i.test(cur.name)) return true;
    cur = cur.parent;
  }
  return false;
}

/** The eye primitives are tiny separate skinned meshes: material "Eye" on the
 *  male models, a ≤140-vert "Brown" primitive on the female heads. */
function isEyeMesh(mesh: THREE.Mesh): boolean {
  const n = matName(Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material);
  if (/^eye(s)?$/i.test(n)) return true;
  const count = (mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined)?.count ?? 0;
  return /^brown$/i.test(n) && count > 0 && count <= 140 && inHead(mesh);
}

function findEyeMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && isEyeMesh(m)) out.push(m);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Material realism
// ---------------------------------------------------------------------------

const tmpColor = new THREE.Color();

/** Build a MeshPhysicalMaterial carrying over the current (already-tinted)
 *  colour and name of `src`. */
function physicalFrom(src: THREE.Material): THREE.MeshPhysicalMaterial {
  const s = src as THREE.MeshStandardMaterial;
  const m = new THREE.MeshPhysicalMaterial({
    color: s.color ? s.color.clone() : new THREE.Color(0xffffff),
    roughness: s.roughness ?? 0.5,
    metalness: s.metalness ?? 0,
  });
  m.name = src.name;
  m.envMapIntensity = 0.55; // subtle when a preview env-map exists; inert in-game
  return m;
}

function styleSkin(src: THREE.Material, g: Grooming): THREE.MeshPhysicalMaterial {
  const m = physicalFrom(src);
  m.color.lerp(tmpColor.set(g.skinTone), g.skinBlend);
  m.roughness = 0.52;
  m.sheen = 0.18;
  m.sheenRoughness = 0.55;
  m.sheenColor.copy(m.color).multiplyScalar(1.2);
  m.specularIntensity = 0.4;
  addMicroDetail(m, 0.035, 60);
  return m;
}

function styleHair(src: THREE.Material, mesh: THREE.Mesh): THREE.MeshPhysicalMaterial {
  const m = physicalFrom(src);
  m.roughness = 0.58;
  m.sheen = 0.32;
  m.sheenRoughness = 0.4;
  m.sheenColor.copy(m.color).lerp(new THREE.Color(0xffffff), 0.35);
  m.specularIntensity = 0.35;
  // Root→tip value gradient: darker under-layers low, light catching the crown.
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  if (bb && bb.max.y - bb.min.y > 0.05) addMicroDetail(m, 0.09, 100, [bb.min.y, bb.max.y]);
  else addMicroDetail(m, 0.09, 100);
  return m;
}

function styleEye(src: THREE.Material): THREE.MeshPhysicalMaterial {
  const m = physicalFrom(src);
  m.color.multiplyScalar(0.55); // darker, wetter iris
  m.roughness = 0.14;
  m.clearcoat = 0.4;
  m.clearcoatRoughness = 0.2;
  m.specularIntensity = 1.1;
  m.emissive.set(0x0d0a08); // never dead-black in shadow
  m.envMapIntensity = 0.45;
  return m;
}

function styleCloth(src: THREE.Material, rule: ClothRule): THREE.MeshStandardMaterial {
  // Cloth is MOST of every avatar's materials, so it stays MeshStandardMaterial:
  // Physical's sheen/clearcoat variants each cost a distinct shader program,
  // and under software WebGL (CI, weak devices) every extra program is a
  // multi-second main-thread compile. Sheen/clearcoat rules are approximated
  // with roughness — at game distance the difference doesn't read.
  const s = src as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color: s.color ? s.color.clone() : new THREE.Color(0xffffff),
    roughness: s.roughness ?? 0.5,
    metalness: s.metalness ?? 0,
  });
  m.name = src.name;
  m.envMapIntensity = 0.55;
  if (rule.metal != null) {
    m.metalness = rule.metal;
    m.roughness = rule.rough ?? 0.4;
  } else {
    m.roughness = rule.rough ?? 0.85;
    if (rule.sheen) m.roughness = Math.max(0.35, m.roughness - rule.sheen * 0.55);
    if (rule.clearcoat) m.roughness = Math.max(0.25, m.roughness - rule.clearcoat * 0.3);
  }
  if (rule.grain) addMicroDetail(m, rule.grain[0], rule.grain[1]);
  return m;
}

/** Generic fabric for cloth with no explicit personality: keep colour, spread
 *  roughness a little, faint sheen + grain so nothing reads as bare plastic. */
const GENERIC_CLOTH: ClothRule = { rough: 0.82, sheen: 0.15, grain: [0.1, 160] };

// ---------------------------------------------------------------------------
// Eyelids — skin-toned quads hung from the head bone over each eye
// ---------------------------------------------------------------------------

interface LidRef {
  mesh: THREE.Mesh;
  /** Full-coverage scale (blink); rest coverage is restLid of this. */
  restScale: number;
}

const tmpMat4 = new THREE.Matrix4();
const tmpVec = new THREE.Vector3();
const tmpEuler = new THREE.Euler();

/** Cluster the eye primitive's bind-space vertices into left/right eyes and
 *  return a bbox per eye. W_Formal merges brows into the same primitive, so
 *  large clusters are re-banded to their lower (eye) portion. */
function eyeBoxes(mesh: THREE.Mesh): THREE.Box3[] {
  const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return [];
  const sides = [new THREE.Box3(), new THREE.Box3()];
  for (let i = 0; i < pos.count; i++) {
    const s = pos.getX(i) >= 0 ? 0 : 1;
    sides[s].expandByPoint(tmpVec.set(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  const out: THREE.Box3[] = [];
  const banded = pos.count > 60; // eyes+brows share this primitive → band-split
  for (let s = 0; s < 2; s++) {
    const box = sides[s];
    if (box.isEmpty()) continue;
    if (banded && box.max.y - box.min.y > 0.024) {
      const cut = box.min.y + (box.max.y - box.min.y) * 0.62;
      const b = new THREE.Box3();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        if ((x >= 0 ? 0 : 1) !== s) continue;
        const y = pos.getY(i);
        if (y <= cut) b.expandByPoint(tmpVec.set(x, y, pos.getZ(i)));
      }
      if (!b.isEmpty()) out.push(b);
    } else {
      out.push(box);
    }
  }
  return out;
}

/** Create the lid quads for one skinned eye mesh, parented to the Head bone in
 *  its bind frame so they track every head move exactly. Returns lid refs. */
function buildLids(eye: THREE.Mesh, skinColor: THREE.Color, restLid: number): LidRef[] {
  const skinned = eye as THREE.SkinnedMesh;
  if (!skinned.isSkinnedMesh || !skinned.skeleton) return [];
  const bones = skinned.skeleton.bones;
  const headIdx = bones.findIndex((b) => norm(b.name) === "head");
  if (headIdx < 0) return [];
  const head = bones[headIdx];
  const inv = skinned.skeleton.boneInverses[headIdx]; // bind-mesh space -> head-local
  const lids: LidRef[] = [];
  const lidMat = new THREE.MeshStandardMaterial({
    color: skinColor.clone().multiplyScalar(0.8),
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  lidMat.name = "dh-lid";
  for (const box of eyeBoxes(eye)) {
    const w = (box.max.x - box.min.x) * 1.4;
    const h = (box.max.y - box.min.y) * 1.9;
    if (!(w > 0.001 && h > 0.001)) continue;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, -h / 2, 0); // pivot at the top edge: scale.y draws the lid down
    const lid = new THREE.Mesh(geo, lidMat);
    lid.name = "dh-lid";
    // Anchor at the top of the eye, a lash-depth in front of it, in bind space…
    const anchor = new THREE.Group();
    anchor.name = "dh-lid-anchor";
    tmpMat4.copy(inv);
    anchor.quaternion.setFromRotationMatrix(tmpMat4);
    anchor.position
      .set((box.min.x + box.max.x) / 2, box.max.y + h * 0.06, box.max.z + 0.006)
      .applyMatrix4(inv);
    // …then hand the whole thing to the head bone.
    anchor.add(lid);
    head.add(anchor);
    lid.scale.y = Math.max(0.02, restLid);
    lids.push({ mesh: lid, restScale: Math.max(0.02, restLid) });
  }
  return lids;
}

// ---------------------------------------------------------------------------
// Studio environment
// ---------------------------------------------------------------------------

/**
 * A tiny procedural equirect environment for the physical materials (skin
 * sheen, wet eyes, gold) to reflect: warm floor bounce, dim cool ceiling and
 * two soft warm "softbox" patches. A 64x32 DataTexture costs microseconds —
 * unlike PMREM-from-scene, which stalls software WebGL (SwiftShader in CI)
 * for tens of seconds and wedges the main thread.
 */
export function makeStudioEnvTexture(): THREE.DataTexture {
  const w = 64;
  const h = 32;
  const data = new Uint8Array(w * h * 4);
  const put = (i: number, r: number, g: number, b: number) => {
    data[i] = Math.min(255, r);
    data[i + 1] = Math.min(255, g);
    data[i + 2] = Math.min(255, b);
    data[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1); // 0 = ceiling, 1 = floor
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      // Base: dim violet-grey ceiling falling to a warm umber floor bounce.
      let r = 18 + v * 46;
      let g = 16 + v * 34;
      let b = 26 + v * 26;
      // Key softbox: warm bright patch high front-right.
      const dk = Math.hypot((u - 0.68) * 2.6, (v - 0.3) * 3.2);
      const k = Math.max(0, 1 - dk);
      r += 190 * k * k;
      g += 160 * k * k;
      b += 110 * k * k;
      // Rim patch: amber glow low back-left.
      const dr = Math.hypot((u - 0.12) * 3.0, (v - 0.62) * 3.6);
      const rim = Math.max(0, 1 - dr);
      r += 120 * rim * rim;
      g += 66 * rim * rim;
      b += 30 * rim * rim;
      put((y * w + x) * 4, r, g, b);
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// refineExplorerAvatar
// ---------------------------------------------------------------------------

/**
 * Refine a freshly cloned (and identity-tinted) explorer model in place:
 * smooth geometry, upgrade materials, apply the grooming table, grow eyelids.
 * Idempotent per root. Call BEFORE measuring/scaling the model to height —
 * the optional build broadening changes the silhouette.
 */
export function refineExplorerAvatar(root: THREE.Object3D, archetype?: string): void {
  if (root.userData.dhRefined) return;
  root.userData.dhRefined = true;
  const g = (archetype && GROOM[archetype]) || DEFAULT_GROOM;

  let skinColor: THREE.Color | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = smoothGeometry(mesh.geometry);
    const eye = isEyeMesh(mesh);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const restyled = mats.map((src) => {
      const n = matName(src);
      if (eye) return styleEye(src);
      if (/skin/i.test(n)) {
        const m = styleSkin(src, g);
        if (!skinColor) skinColor = m.color;
        return m;
      }
      if (/hair|eyebrow|beard/i.test(n)) return styleHair(src, mesh);
      // Vance's hair shares the dress material name "Red" on the head mesh.
      if (/^red$/i.test(n) && inHead(mesh) && archetype === "vance") {
        const m = styleHair(src, mesh);
        m.color.lerp(tmpColor.set(0x54301c), 0.45); // restore a warm auburn
        return m;
      }
      return styleCloth(src, g.cloth[n] ?? GENERIC_CLOTH);
    });
    mesh.material = Array.isArray(mesh.material) ? restyled : restyled[0]!;
  });

  // Eyelids: definition at rest, blinks from the life layer.
  const sc: THREE.Color = skinColor ?? new THREE.Color(0xc08a62);
  const lids: LidRef[] = [];
  for (const eye of findEyeMeshes(root)) lids.push(...buildLids(eye, sc, g.restLid));
  root.userData.dhLids = lids;

  // Build: broaden the figure inside a wrapper so the frontends' height-fit
  // (which overwrites root.scale) can't undo it.
  if (g.build) {
    const wrap = new THREE.Group();
    wrap.name = "dh-build";
    wrap.scale.set(g.build[0], 1, g.build[1]);
    const children = root.children.slice();
    for (const c of children) wrap.add(c);
    root.add(wrap);
  }
}

// ---------------------------------------------------------------------------
// attachAvatarLife — breathing, attention, blinks, relaxed hands
// ---------------------------------------------------------------------------

export interface AvatarLife {
  /** Apply the additive life layer. Call every frame AFTER the mixer update.
   *  Time is accumulated internally from dt (deterministic under frozen
   *  clocks), so only dt is required. */
  update(dt: number): void;
  /** When the house takes them: stills the breath, closes the eyes. */
  dead: boolean;
}

/** Finger curl per joint index (1 = in-palm metacarpal, barely; 2 = knuckle;
 *  3–4 = phalanges) — a relaxed hand, not a fist. Bind pose is starfish-stiff.
 *  Negative local X on these rigs flexes the finger toward the palm. */
const CURL: Record<number, number> = { 1: -0.03, 2: -0.22, 3: -0.26, 4: -0.18 };
const THUMB_CURL: Record<number, number> = { 1: -0.02, 2: -0.1, 3: -0.12 };

const AXIS_X = new THREE.Vector3(1, 0, 0);
const tmpQ = new THREE.Quaternion();

/**
 * A bone we add rotation on top of the mixer. three's PropertyMixer has a
 * dirty-check: bones whose track values did not change this frame (constant
 * tracks, frozen clocks) are NOT rewritten — so a naive additive would
 * compound frame over frame. We remember both the mixer's value (`base`) and
 * what we last wrote (`last`): if the bone still holds `last`, the mixer
 * skipped it and we re-derive from `base`; anything else is a fresh mixer
 * write and becomes the new base.
 */
interface ManagedBone {
  bone: THREE.Object3D;
  base: THREE.Quaternion;
  last: THREE.Quaternion;
}

function managed(bone: THREE.Object3D): ManagedBone {
  return { bone, base: bone.quaternion.clone(), last: bone.quaternion.clone() };
}

function applyAdd(m: ManagedBone, dq: THREE.Quaternion): void {
  const q = m.bone.quaternion;
  if (q.x !== m.last.x || q.y !== m.last.y || q.z !== m.last.z || q.w !== m.last.w) m.base.copy(q);
  q.copy(m.base).multiply(dq);
  m.last.copy(q);
}

interface FingerRef {
  m: ManagedBone;
  dq: THREE.Quaternion;
}

/**
 * Wire the always-on life layer for a refined avatar. Returns an updater whose
 * work is entirely additive on top of whatever clip the mixer wrote this frame
 * (breath on the torso chain, drift on neck/head, curl on the finger chains,
 * lid scale for blinks). Allocation-free per frame.
 */
export function attachAvatarLife(root: THREE.Object3D, archetype?: string): AvatarLife {
  const prev = root.userData.dhLife as AvatarLife | undefined;
  if (prev) return prev;
  const g = (archetype && GROOM[archetype]) || DEFAULT_GROOM;
  const [breathAmp, breathRate] = g.breath ?? [1, 1];
  const drift = g.headDrift ?? 0.7;
  const [postChest, postHead, postRoll] = g.posture ?? [0, 0, 0];

  // Cache bone references once.
  let chest: ManagedBone | null = null;
  let abdomen: ManagedBone | null = null;
  let neck: ManagedBone | null = null;
  let head: ManagedBone | null = null;
  const fingers: FingerRef[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    const n = norm(o.name);
    if (n === "chest") chest = managed(o);
    else if (n === "abdomen") abdomen = managed(o);
    else if (n === "neck") neck = managed(o);
    else if (n === "head") head = managed(o);
    else {
      const m = /^(index|middle|ring|pinky|thumb)(\d)[lr]$/.exec(n);
      if (m) {
        const joint = Number(m[2]);
        const amt = m[1] === "thumb" ? THUMB_CURL[joint] : CURL[joint];
        // The relaxed-hand curl is constant per joint: precompute the delta.
        if (amt) fingers.push({ m: managed(o), dq: new THREE.Quaternion().setFromAxisAngle(AXIS_X, amt) });
      }
    }
  });
  const lids = (root.userData.dhLids as LidRef[] | undefined) ?? [];
  // The clips carry no scale tracks, so bone scale must be written absolutely
  // (an additive multiply would compound frame over frame).
  const chestBaseScale = chest ? (chest as ManagedBone).bone.scale.x : 1;

  let t = Math.random() * 20; // desynchronise the six from one another
  let nextBlink = t + 1.5 + Math.random() * 3;
  const seed = Math.random() * 97;

  const life: AvatarLife = {
    dead: false,
    update(dt: number) {
      if (this.dead) {
        for (const l of lids) l.mesh.scale.y = 1.05; // eyes closed for the fallen
        return;
      }
      // Under a frozen clock (screenshot rigs) nothing advances: keep the pose
      // exactly as the last live frame left it.
      if (!(dt > 0)) return;
      t += dt;

      // Relaxed hands — offset over the clip's own finger pose.
      for (const f of fingers) applyAdd(f.m, f.dq);

      // Breathing: chest lifts, abdomen counters, with a slow uneven cadence.
      const br = Math.sin(t * 1.55 * breathRate + Math.sin(t * 0.31) * 0.4);
      const breath = br * 0.012 * breathAmp;
      if (chest) {
        tmpQ.setFromAxisAngle(AXIS_X, -breath + postChest);
        applyAdd(chest, tmpQ);
        chest.bone.scale.setScalar(chestBaseScale * (1 + br * 0.004 * breathAmp));
      }
      if (abdomen) {
        tmpQ.setFromAxisAngle(AXIS_X, breath * 0.6);
        applyAdd(abdomen, tmpQ);
      }

      // Attention: the head wanders in slow overlapping arcs, the neck follows.
      const yaw = (Math.sin(t * 0.23 + seed) * 0.055 + Math.sin(t * 0.47 + seed * 2) * 0.03) * drift;
      const pitch = (Math.sin(t * 0.19 + seed * 3) * 0.025 + Math.sin(t * 0.53 + seed) * 0.015) * drift;
      if (head) {
        tmpQ.setFromEuler(tmpEuler.set(pitch + postHead, yaw, postRoll));
        applyAdd(head, tmpQ);
      }
      if (neck) {
        tmpQ.setFromEuler(tmpEuler.set(pitch * 0.4, yaw * 0.5, 0));
        applyAdd(neck, tmpQ);
      }

      // Blinks: fast close, brief hold, slower open; occasional double-blink.
      if (lids.length) {
        let cover = 0;
        const since = t - nextBlink;
        if (since >= 0) {
          if (since < 0.07) cover = since / 0.07;
          else if (since < 0.12) cover = 1;
          else if (since < 0.24) cover = 1 - (since - 0.12) / 0.12;
          else {
            nextBlink = t + 2.2 + ((seed * 1013 + t * 71) % 43) / 10; // 2.2–6.5s
            if (((seed + t) * 17) % 7 < 1) nextBlink = t + 0.28; // double-blink
          }
        }
        for (const l of lids) {
          l.mesh.scale.y = l.restScale + (1.08 - l.restScale) * cover;
        }
      }
    },
  };
  root.userData.dhLife = life;
  return life;
}
