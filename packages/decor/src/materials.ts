import * as THREE from "three";

/**
 * @dread-hollow/decor — procedural material library
 *
 * Runtime, CanvasTexture-based PBR materials for room floors, walls and
 * surfaces. Everything is generated procedurally at runtime; no external
 * image assets are used.
 *
 * DISPOSAL CONTRACT (see the conventions block at the top of `index.ts`):
 *  - Callers dispose materials per room (`Material.dispose()`) when clearing
 *    a room. `Material.dispose()` does NOT dispose the textures it references.
 *  - Therefore we CACHE TEXTURES at module level (shared across all rooms,
 *    never disposed) but return a FRESH `MeshStandardMaterial` on every call.
 *    Disposing a returned material is safe — it leaves the shared cached
 *    textures intact for the next room that wants the same surface.
 *
 * Keep all generated textures small (<= 256px) — they tile via RepeatWrapping.
 */

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

let QUALITY: "low" | "high" = "high";

/**
 * Set the global texture quality. On "low" the material builders take a
 * param-only path (flat color, no generated maps) so they work without a DOM
 * (e.g. node smoke-tests) and stay cheap on weak hardware.
 */
export function setQuality(q: "low" | "high"): void {
  QUALITY = q;
}

// ---------------------------------------------------------------------------
// Seeded RNG + canvas drawing helpers
// ---------------------------------------------------------------------------

/** A small deterministic PRNG (mulberry32) seeded by `seed`. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toCss(hex: number): string {
  return "#" + (hex & 0xffffff).toString(16).padStart(6, "0");
}

/** Flood-fill the whole canvas with a solid color. */
export function fill(ctx: CanvasRenderingContext2D, size: number, hex: number): void {
  ctx.fillStyle = toCss(hex);
  ctx.fillRect(0, 0, size, size);
}

/**
 * Scatter `count` soft radial splats of `hex` (alpha `alpha`) with radii in
 * [rMin, rMax]. Used to break up flat fills into mottled, aged surfaces.
 */
export function mottle(
  ctx: CanvasRenderingContext2D,
  size: number,
  hex: number,
  count: number,
  rMin: number,
  rMax: number,
  alpha: number,
  seed: number
): void {
  const rand = rng(seed);
  // parse to rgb for gradient stops
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  for (let i = 0; i < count; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = rMin + rand() * (rMax - rMin);
    const a = alpha * (0.5 + rand() * 0.5);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/** Add per-pixel monochrome noise (+/- `amount` on each channel). */
export function grain(ctx: CanvasRenderingContext2D, size: number, amount: number, seed: number): void {
  const rand = rng(seed);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 2 * amount;
    d[i] = clamp255(d[i] + n);
    d[i + 1] = clamp255(d[i + 1] + n);
    d[i + 2] = clamp255(d[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// ---------------------------------------------------------------------------
// Texture creation + cache
// ---------------------------------------------------------------------------

/**
 * Create a CanvasTexture by running `draw(ctx, size)` against an offscreen
 * canvas. Returns a tiling texture (RepeatWrapping) with anisotropy 4.
 */
export function makeTexture(
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  opts: { size?: number; repeat?: [number, number]; srgb?: boolean } = {}
): THREE.CanvasTexture {
  const size = opts.size ?? 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.needsUpdate = true;
  return tex;
}

/** Module-level texture cache. Cached textures are shared and never disposed. */
const texCache = new Map<string, THREE.Texture>();

/** Get a cached texture by key, building (and caching) it on first request. */
function cachedTexture(key: string, build: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) {
    t = build();
    texCache.set(key, t);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Material builders
// ---------------------------------------------------------------------------

export interface MatParams {
  tint?: number;
  repeat?: number;
  cheap?: boolean;
}

/** Whether to take the cheap, map-free path (low quality or explicit flag). */
function cheapPath(p?: MatParams): boolean {
  return QUALITY === "low" || !!(p && p.cheap);
}

/** Suffix for repeat-tiled cache keys, e.g. "wood:color" -> "wood:color:r2". */
function rkey(base: string, repeat: number): string {
  return repeat === 1 ? base : `${base}:r${repeat}`;
}

// --- aged hardwood ---------------------------------------------------------

function drawWoodColor(ctx: CanvasRenderingContext2D, size: number): void {
  const rand = rng(101);
  fill(ctx, size, 0x6b4a2c);
  const plankH = size / 6;
  for (let p = 0; p < 6; p++) {
    const y = p * plankH;
    const base = 0x5a3d24 + ((rand() * 0x202018) | 0) - 0x101008;
    ctx.fillStyle = toCss(base & 0xffffff);
    ctx.fillRect(0, y, size, plankH);
    // wood-grain streaks
    const streaks = 14;
    for (let i = 0; i < streaks; i++) {
      const gy = y + rand() * plankH;
      ctx.strokeStyle = `rgba(40,26,14,${0.06 + rand() * 0.12})`;
      ctx.lineWidth = 0.5 + rand() * 1.2;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      let cy = gy;
      for (let x = 0; x <= size; x += 16) {
        cy += (rand() - 0.5) * 2.4;
        ctx.lineTo(x, cy);
      }
      ctx.stroke();
    }
    // plank seam (dark groove)
    ctx.strokeStyle = "rgba(20,12,6,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }
  mottle(ctx, size, 0x2a1c10, 30, 6, 22, 0.18, 7);
  grain(ctx, size, 14, 31);
}

function drawWoodBump(ctx: CanvasRenderingContext2D, size: number): void {
  const rand = rng(202);
  fill(ctx, size, 0x808080);
  const plankH = size / 6;
  for (let p = 0; p < 6; p++) {
    const y = p * plankH;
    for (let i = 0; i < 16; i++) {
      const gy = y + rand() * plankH;
      ctx.strokeStyle = `rgba(${(rand() * 80) | 0},${(rand() * 80) | 0},${(rand() * 80) | 0},0.5)`;
      ctx.lineWidth = 0.5 + rand() * 1.5;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      let cy = gy;
      for (let x = 0; x <= size; x += 16) {
        cy += (rand() - 0.5) * 2;
        ctx.lineTo(x, cy);
      }
      ctx.stroke();
    }
    // deep seam
    ctx.strokeStyle = "rgba(20,20,20,1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }
  grain(ctx, size, 18, 41);
}

function drawWoodRough(ctx: CanvasRenderingContext2D, size: number): void {
  fill(ctx, size, 0xd0d0d0);
  mottle(ctx, size, 0xffffff, 26, 8, 26, 0.4, 9);
  mottle(ctx, size, 0x707070, 22, 8, 26, 0.4, 13);
  grain(ctx, size, 24, 51);
}

// --- cracked stone ---------------------------------------------------------

function drawStoneColor(ctx: CanvasRenderingContext2D, size: number): void {
  const rand = rng(303);
  fill(ctx, size, 0x6f6a63);
  const cols = 4;
  const rows = 4;
  const cw = size / cols;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * cw * 0.5;
    for (let c = -1; c < cols; c++) {
      const x = c * cw + offset + 2;
      const y = r * rh + 2;
      const w = cw - 4 + (rand() - 0.5) * 4;
      const h = rh - 4;
      // Close-up rule: blocks are the SAME stone — variation lives inside a
      // block (grazing-light gradient), not between blocks. A wide per-block
      // shade lottery read as a colored-brick patchwork at eye height.
      const shade = 0x635e56 + ((rand() * 0x0e0e0c) | 0) - 0x070706;
      ctx.fillStyle = toCss(shade & 0xffffff);
      ctx.fillRect(x, y, w, h);
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, "rgba(255,255,255,0.05)");
      g.addColorStop(0.55, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.09)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
  }
  // mortar darkening already shows through gaps; add grime + cracks
  mottle(ctx, size, 0x3a3630, 40, 4, 16, 0.22, 17);
  mottle(ctx, size, 0x8a857c, 24, 4, 14, 0.16, 23);
  // Cracks: real settling cracks keep a heading and sink downward — the old
  // ±40px random walk at alpha .7 magnified into bold scribbles up close.
  const rc = rng(404);
  ctx.strokeStyle = "rgba(28,24,20,0.35)";
  for (let i = 0; i < 4; i++) {
    ctx.lineWidth = 0.4 + rc() * 0.5;
    ctx.beginPath();
    let x = rc() * size;
    let y = rc() * size * 0.5;
    ctx.moveTo(x, y);
    let ang = Math.PI * (0.35 + rc() * 0.3); // headed broadly downward
    const steps = 8 + ((rc() * 3) | 0);
    for (let s = 0; s < steps; s++) {
      ang += (rc() - 0.5) * 0.5;
      x += Math.cos(ang) * (8 + rc() * 6);
      y += Math.sin(ang) * (8 + rc() * 6);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, size, 12, 61);
}

function drawStoneBump(ctx: CanvasRenderingContext2D, size: number): void {
  const rand = rng(303); // mirror block layout
  fill(ctx, size, 0x303030); // mortar = low
  const cols = 4;
  const rows = 4;
  const cw = size / cols;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * cw * 0.5;
    for (let c = -1; c < cols; c++) {
      const x = c * cw + offset + 2;
      const y = r * rh + 2;
      const w = cw - 4 + (rand() - 0.5) * 4;
      const h = rh - 4;
      ctx.fillStyle = toCss((0xb0b0b0 + ((rand() * 0x303030) | 0) - 0x181818) & 0xffffff);
      ctx.fillRect(x, y, w, h);
    }
  }
  // crack grooves (dark = recessed)
  const rc = rng(404);
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  for (let i = 0; i < 7; i++) {
    ctx.lineWidth = 1 + rc() * 1.5;
    ctx.beginPath();
    let x = rc() * size;
    let y = rc() * size;
    ctx.moveTo(x, y);
    const steps = 5 + ((rc() * 5) | 0);
    for (let s = 0; s < steps; s++) {
      x += (rc() - 0.5) * 40;
      y += (rc() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, size, 20, 71);
}

function drawStoneRough(ctx: CanvasRenderingContext2D, size: number): void {
  fill(ctx, size, 0xdedede);
  mottle(ctx, size, 0x909090, 36, 6, 20, 0.3, 81);
  grain(ctx, size, 22, 91);
}

// --- peeling wallpaper -----------------------------------------------------

function drawWallpaperColor(ctx: CanvasRenderingContext2D, size: number): void {
  fill(ctx, size, 0x8a7d68);
  // faint damask diamonds
  ctx.strokeStyle = "rgba(120,105,80,0.25)";
  ctx.lineWidth = 1;
  const step = size / 6;
  for (let gx = -1; gx <= 6; gx++) {
    for (let gy = -1; gy <= 6; gy++) {
      const cx = gx * step + (gy % 2) * step * 0.5;
      const cy = gy * step;
      ctx.beginPath();
      ctx.ellipse(cx, cy, step * 0.28, step * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      // little flourish dot
      ctx.fillStyle = "rgba(150,130,95,0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // a peel patch revealing darker plaster underneath
  const rand = rng(505);
  const px = size * 0.62;
  const py = size * 0.1;
  ctx.fillStyle = "rgba(70,58,46,0.85)";
  ctx.beginPath();
  ctx.moveTo(px, py);
  let ang = 0;
  const peelR = size * 0.22;
  for (let i = 0; i <= 14; i++) {
    ang = (i / 14) * Math.PI * 2;
    const rr = peelR * (0.6 + rand() * 0.5);
    ctx.lineTo(px + Math.cos(ang) * rr, py + Math.sin(ang) * rr * 1.3);
  }
  ctx.closePath();
  ctx.fill();
  // curled highlight along the peel edge
  ctx.strokeStyle = "rgba(180,165,140,0.5)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, py + peelR * 0.9, peelR * 0.7, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  // grime gradient toward the bottom
  const grime = ctx.createLinearGradient(0, size * 0.5, 0, size);
  grime.addColorStop(0, "rgba(40,30,22,0)");
  grime.addColorStop(1, "rgba(40,30,22,0.4)");
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, 8, 95);
}

// --- stained plaster -------------------------------------------------------

function drawPlasterColor(ctx: CanvasRenderingContext2D, size: number): void {
  fill(ctx, size, 0xcabfa8);
  mottle(ctx, size, 0xb8ac92, 30, 10, 30, 0.2, 111);
  // tea-brown water stains with a darker tide ring
  const rand = rng(112);
  for (let i = 0; i < 4; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = size * (0.12 + rand() * 0.14);
    const stain = ctx.createRadialGradient(x, y, 0, x, y, rad);
    stain.addColorStop(0, "rgba(120,86,52,0.05)");
    stain.addColorStop(0.78, "rgba(110,78,46,0.1)");
    stain.addColorStop(0.92, "rgba(86,58,32,0.18)"); // tide ring — a whisper
    stain.addColorStop(1, "rgba(86,58,32,0)");
    ctx.fillStyle = stain;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // mold specks
  mottle(ctx, size, 0x46503a, 50, 1, 4, 0.35, 121);
  // Hairline cracks: persistent heading + downward settle (see drawStoneColor
  // — the ±36px random walk read as pencil scribbles at eye height).
  const rc = rng(131);
  ctx.strokeStyle = "rgba(90,82,70,0.3)";
  for (let i = 0; i < 4; i++) {
    ctx.lineWidth = 0.4 + rc() * 0.5;
    ctx.beginPath();
    let x = rc() * size;
    let y = rc() * size * 0.5;
    ctx.moveTo(x, y);
    let ang = Math.PI * (0.35 + rc() * 0.3);
    for (let s = 0; s < 8; s++) {
      ang += (rc() - 0.5) * 0.5;
      x += Math.cos(ang) * (7 + rc() * 6);
      y += Math.sin(ang) * (7 + rc() * 6);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, size, 9, 141);
}

// --- marble ----------------------------------------------------------------

function drawMarbleColor(ctx: CanvasRenderingContext2D, size: number): void {
  fill(ctx, size, 0xe8e6df);
  mottle(ctx, size, 0xd8d4c8, 18, 20, 50, 0.25, 151);
  // meandering veins
  const rc = rng(161);
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = i % 3 === 0 ? "rgba(90,86,80,0.45)" : "rgba(150,144,134,0.4)";
    ctx.lineWidth = 0.5 + rc() * 1.5;
    ctx.beginPath();
    let x = rc() * size;
    let y = -4;
    ctx.moveTo(x, y);
    while (y < size) {
      x += (rc() - 0.5) * 24;
      y += 6 + rc() * 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, size, 5, 171);
}

function drawMarbleRough(ctx: CanvasRenderingContext2D, size: number): void {
  // low roughness overall (polished); slight variation
  fill(ctx, size, 0x4d4d4d);
  mottle(ctx, size, 0x5e5e5e, 16, 16, 44, 0.4, 181);
  grain(ctx, size, 8, 191);
}

// --- rusted metal ----------------------------------------------------------

function drawRustColor(ctx: CanvasRenderingContext2D, size: number): void {
  fill(ctx, size, 0x4a4d52);
  mottle(ctx, size, 0x3a3d42, 24, 10, 30, 0.3, 211);
  // rust blooms
  mottle(ctx, size, 0x8a4a26, 26, 8, 34, 0.55, 221);
  mottle(ctx, size, 0x6a3318, 30, 4, 18, 0.55, 231);
  mottle(ctx, size, 0xb06a3a, 18, 3, 12, 0.45, 241);
  grain(ctx, size, 16, 251);
}

function drawRustRough(ctx: CanvasRenderingContext2D, size: number): void {
  // bare metal = smoother (dark); rust = rough (white)
  fill(ctx, size, 0x4a4a4a);
  mottle(ctx, size, 0xf0f0f0, 26, 8, 34, 0.8, 221);
  mottle(ctx, size, 0xe0e0e0, 30, 4, 18, 0.8, 231);
  grain(ctx, size, 16, 252);
}

function drawRustMetal(ctx: CanvasRenderingContext2D, size: number): void {
  // bare metal = metallic (white); rust = non-metal (black)
  fill(ctx, size, 0xf0f0f0);
  mottle(ctx, size, 0x101010, 26, 8, 34, 0.85, 221);
  mottle(ctx, size, 0x000000, 30, 4, 18, 0.85, 231);
  mottle(ctx, size, 0x101010, 18, 3, 12, 0.7, 241);
}

// --- dark iron -------------------------------------------------------------

function drawIronColor(ctx: CanvasRenderingContext2D, size: number): void {
  fill(ctx, size, 0x1a1a1d);
  mottle(ctx, size, 0x2a2a2e, 22, 10, 30, 0.4, 261);
  mottle(ctx, size, 0x101012, 22, 8, 24, 0.4, 271);
  // subtle wear scratches (lighter)
  const rc = rng(281);
  ctx.strokeStyle = "rgba(90,90,98,0.25)";
  for (let i = 0; i < 10; i++) {
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    const x = rc() * size;
    const y = rc() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rc() - 0.5) * 40, y + (rc() - 0.5) * 40);
    ctx.stroke();
  }
  grain(ctx, size, 10, 291);
}

// --- tarnished gold --------------------------------------------------------

function drawGoldColor(ctx: CanvasRenderingContext2D, size: number): void {
  fill(ctx, size, 0xc8a23a);
  mottle(ctx, size, 0xe0c266, 20, 12, 34, 0.4, 311);
  // green/brown patina
  mottle(ctx, size, 0x4a6a3a, 22, 6, 22, 0.4, 321);
  mottle(ctx, size, 0x5a4a22, 24, 5, 18, 0.45, 331);
  mottle(ctx, size, 0x2a3a26, 16, 3, 12, 0.5, 341);
  grain(ctx, size, 8, 351);
}

function drawGoldRough(ctx: CanvasRenderingContext2D, size: number): void {
  // gold = smooth (dark); patina = rough (white)
  fill(ctx, size, 0x404040);
  mottle(ctx, size, 0xd0d0d0, 22, 6, 22, 0.7, 321);
  mottle(ctx, size, 0xe0e0e0, 24, 5, 18, 0.7, 331);
  mottle(ctx, size, 0xf0f0f0, 16, 3, 12, 0.7, 341);
  grain(ctx, size, 10, 352);
}

// --- rug fabric ------------------------------------------------------------

function drawRugColor(ctx: CanvasRenderingContext2D, size: number, base: number, accent: number): void {
  fill(ctx, size, base);
  const inset = size * 0.1;
  // border bands
  ctx.strokeStyle = toCss(accent);
  ctx.lineWidth = size * 0.05;
  ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
  ctx.lineWidth = size * 0.015;
  ctx.strokeRect(inset * 1.7, inset * 1.7, size - inset * 3.4, size - inset * 3.4);
  // central medallion
  ctx.strokeStyle = toCss(accent);
  ctx.lineWidth = size * 0.02;
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, size * 0.22, size * 0.16, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, size * 0.1, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fillStyle = toCss(accent);
  ctx.fill();
  // weave hatch
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 0.5;
  for (let x = 0; x < size; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  for (let y = 0; y < size; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  grain(ctx, size, 12, 361);
}

// ---------------------------------------------------------------------------
// Public material API
// ---------------------------------------------------------------------------

export const materials = {
  agedHardwood(p?: MatParams): THREE.MeshStandardMaterial {
    const tint = p?.tint ?? 0xffffff;
    if (cheapPath(p)) {
      return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, metalness: 0 });
    }
    const repeat = p?.repeat ?? 2;
    const rep: [number, number] = [repeat, repeat];
    return new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.9,
      metalness: 0,
      map: cachedTexture(rkey("wood:color", repeat), () => makeTexture(drawWoodColor, { repeat: rep })),
      bumpMap: cachedTexture(rkey("wood:bump", repeat), () => makeTexture(drawWoodBump, { repeat: rep, srgb: false })),
      bumpScale: 0.03,
      roughnessMap: cachedTexture(rkey("wood:rough", repeat), () => makeTexture(drawWoodRough, { repeat: rep, srgb: false })),
    });
  },

  crackedStone(p?: MatParams): THREE.MeshStandardMaterial {
    const tint = p?.tint ?? 0xffffff;
    if (cheapPath(p)) {
      return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, metalness: 0 });
    }
    const repeat = p?.repeat ?? 2;
    const rep: [number, number] = [repeat, repeat];
    return new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.9,
      metalness: 0,
      map: cachedTexture(rkey("stone:color", repeat), () => makeTexture(drawStoneColor, { repeat: rep })),
      bumpMap: cachedTexture(rkey("stone:bump", repeat), () => makeTexture(drawStoneBump, { repeat: rep, srgb: false })),
      bumpScale: 0.04,
      roughnessMap: cachedTexture(rkey("stone:rough", repeat), () => makeTexture(drawStoneRough, { repeat: rep, srgb: false })),
    });
  },

  peelingWallpaper(p?: MatParams): THREE.MeshStandardMaterial {
    const tint = p?.tint ?? 0xffffff;
    if (cheapPath(p)) {
      return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.88, metalness: 0 });
    }
    const repeat = p?.repeat ?? 1;
    const rep: [number, number] = [repeat, repeat];
    return new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.88,
      metalness: 0,
      map: cachedTexture(rkey("wallpaper:color", repeat), () => makeTexture(drawWallpaperColor, { repeat: rep })),
    });
  },

  stainedPlaster(p?: MatParams): THREE.MeshStandardMaterial {
    const tint = p?.tint ?? 0xffffff;
    if (cheapPath(p)) {
      return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.92, metalness: 0 });
    }
    const repeat = p?.repeat ?? 1;
    const rep: [number, number] = [repeat, repeat];
    return new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.92,
      metalness: 0,
      map: cachedTexture(rkey("plaster:color", repeat), () => makeTexture(drawPlasterColor, { repeat: rep })),
    });
  },

  marble(p?: MatParams): THREE.MeshStandardMaterial {
    const tint = p?.tint ?? 0xffffff;
    if (cheapPath(p)) {
      return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.3, metalness: 0.05 });
    }
    const repeat = p?.repeat ?? 1;
    const rep: [number, number] = [repeat, repeat];
    return new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.3,
      metalness: 0.05,
      map: cachedTexture(rkey("marble:color", repeat), () => makeTexture(drawMarbleColor, { repeat: rep })),
      roughnessMap: cachedTexture(rkey("marble:rough", repeat), () => makeTexture(drawMarbleRough, { repeat: rep, srgb: false })),
    });
  },

  rustedMetal(p?: MatParams): THREE.MeshStandardMaterial {
    const tint = p?.tint ?? 0xffffff;
    if (cheapPath(p)) {
      return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.7, metalness: 0.9 });
    }
    const repeat = p?.repeat ?? 1;
    const rep: [number, number] = [repeat, repeat];
    return new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.7,
      metalness: 0.9,
      map: cachedTexture(rkey("rust:color", repeat), () => makeTexture(drawRustColor, { repeat: rep })),
      roughnessMap: cachedTexture(rkey("rust:rough", repeat), () => makeTexture(drawRustRough, { repeat: rep, srgb: false })),
      metalnessMap: cachedTexture(rkey("rust:metal", repeat), () => makeTexture(drawRustMetal, { repeat: rep, srgb: false })),
    });
  },

  darkIron(p?: MatParams): THREE.MeshStandardMaterial {
    const tint = p?.tint ?? 0xffffff;
    if (cheapPath(p)) {
      return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.5, metalness: 0.9 });
    }
    const repeat = p?.repeat ?? 1;
    const rep: [number, number] = [repeat, repeat];
    return new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.5,
      metalness: 0.9,
      map: cachedTexture(rkey("iron:color", repeat), () => makeTexture(drawIronColor, { repeat: rep })),
    });
  },

  tarnishedGold(p?: MatParams): THREE.MeshStandardMaterial {
    const tint = p?.tint ?? 0xffffff;
    if (cheapPath(p)) {
      return new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.35,
        metalness: 0.95,
        emissive: 0x1a1206,
        emissiveIntensity: 0.15,
      });
    }
    const repeat = p?.repeat ?? 1;
    const rep: [number, number] = [repeat, repeat];
    return new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.35,
      metalness: 0.95,
      emissive: 0x1a1206,
      emissiveIntensity: 0.15,
      map: cachedTexture(rkey("gold:color", repeat), () => makeTexture(drawGoldColor, { repeat: rep })),
      roughnessMap: cachedTexture(rkey("gold:rough", repeat), () => makeTexture(drawGoldRough, { repeat: rep, srgb: false })),
    });
  },

  rugFabric(base: number, accent: number, p?: MatParams): THREE.MeshStandardMaterial {
    const tint = p?.tint ?? 0xffffff;
    if (cheapPath(p)) {
      return new THREE.MeshStandardMaterial({ color: base, roughness: 0.98, metalness: 0 });
    }
    const repeat = p?.repeat ?? 1;
    const rep: [number, number] = [repeat, repeat];
    const key = `rug:color:${base.toString(16)}:${accent.toString(16)}`;
    return new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.98,
      metalness: 0,
      map: cachedTexture(rkey(key, repeat), () => makeTexture((ctx, s) => drawRugColor(ctx, s, base, accent), { repeat: rep })),
    });
  },
};

// ---------------------------------------------------------------------------
// Surface categorization
// ---------------------------------------------------------------------------

export type SurfaceKind = "wood" | "stone";
export type WallKind = "wallpaper" | "plaster" | "stone";

/** Rooms with a stone floor AND stone walls. */
const STONE_ROOMS = new Set<string>([
  "crypt",
  "catacomb",
  "vault",
  "chapel",
  "cold-cellar",
  "boiler-room",
  "pentagram-chamber",
  "grand-staircase",
  "basement-landing",
  "mystic-elevator",
]);

/** Rooms with wallpapered walls (over a wood floor). */
const WALLPAPER_ROOMS = new Set<string>([
  "master-bedroom",
  "abandoned-nursery",
  "study",
  "library",
  "portrait-gallery",
  "foyer",
  "upper-landing",
  "dining-room",
]);

/**
 * Categorize a room into a floor + wall surface kind. Stone rooms get stone
 * floors and walls; a curated set gets wallpapered walls; everything else gets
 * plaster walls. Wood floors for anything not in the stone set. Unknown ids
 * fall back to wood + plaster.
 */
export function surfaceFor(roomId: string): { floor: SurfaceKind; wall: WallKind } {
  if (STONE_ROOMS.has(roomId)) return { floor: "stone", wall: "stone" };
  if (WALLPAPER_ROOMS.has(roomId)) return { floor: "wood", wall: "wallpaper" };
  return { floor: "wood", wall: "plaster" };
}
