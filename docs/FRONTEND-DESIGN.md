# Frontend Design — make it feel like a real haunted house

Synthesis of four parallel design passes (decoration, lighting/atmosphere,
materials/textures, figures/monsters/camera) into one implementable plan. Goal:
move the renderer from "tasteful prototype" to "abandoned manor at midnight."

Everything here is **primitive-only / procedural** (no external models or image
files), works in vanilla three.js, and therefore ports to **both** the R3F
client (`apps/client/src/three`) and the standalone artifact (`artifact/src`).

---

## Cross-cutting implementation roadmap (highest impact first)

1. **Lighting grade fixes** — the single biggest "less prototype-y" win, and
   low-risk: Bloom `luminanceThreshold 0.18 → 0.55`, film-grain Noise
   `0.22 → 0.10`, tighten per-room light falloff, add SMAA + subtle chromatic
   aberration. *(Scene/PostFX/Atmosphere)*
2. **Per-floor mood + light culling** — cold-blue upper, warm-amber ground,
   blood-red basement via one hemisphere fill per floor; cap active point lights
   to ~8 (only explored/in-frame rooms lit).
3. **Procedural material library** — `materials.*` factory backed by a
   dispose-safe **texture cache**; wire floors/walls/props to aged-wood, stone,
   plaster, rust, gold, marble, fabric, glass.
4. **Decoration pass** — new "haunted detailing" helpers (peeling wallpaper,
   cracks, stains, cobweb variants, scattered paper, glass shards, rats, bones,
   chains, broken furniture) + denser per-room sets (8–16 elements), instanced.
5. **Figures & animation** — taller jointed humanoids with per-character
   archetype silhouettes; skeleton-free procedural breathing/sway/turn-to-face/
   hop; richer active-player marker; per-monster distinct looks + motion.
6. **Camera director** — follow the active player by easing `controls.target`
   only (never the camera), idle drift, transient combat/haunt shake — without
   fighting OrbitControls.

> Verify each step with the **headless-WebGL screenshot CI** (Actions →
> Screenshots → artifact), since the 3D can't be rendered in the dev sandbox.

---

## 1. Lighting & atmosphere

**Philosophy: all darkness is blue, all light is amber.** Shadows are the cold
ambient; the only warm sources are practicals (candles/fires).

- **Global rig:** cold moonlight `DirectionalLight #aebfe8 @0.65` from `[14,28,6]`
  (the *only* shadow caster); ambient `#2a3a5e @0.08` (down from 0.12);
  hemisphere sky `#26324f` / ground `#080604 @0.18`; optional faint cold rim.
- **Per-room accent (the workhorse):** tighten falloff to `distance ≈ TILE*1.6`,
  `decay 2.5`, and lower warm practicals to `y≈0.9` (table height) for long wall
  shadows. Warm rooms = amber; chapel/elevator/cellar = desaturated blue; pentagram/
  boiler/crypt = saturated red that bleeds (`decay 1.8`).
- **Flicker:** replace the single sine with layered noise + 1.5% per-frame
  "draft" dropout, plus a hue shift toward deep orange as it dips. Cold/holy
  sources stay steady (supernatural).
- **God-rays (cheap):** large additive open `ConeGeometry` shafts at windows/
  staircase, `opacity 0.04–0.06`, `fog:false`, slow y-rotation; glow **sprites**
  on strong flames so Bloom catches them.
- **Fog:** linear `#070710` near `10` far `40` (pull in for dread); switch to
  `FogExp2 density 0.022→0.030` when the haunt triggers ("the house closes in").
- **Post-processing:** SMAA · Bloom `{threshold 0.55, intensity 0.85, mipmapBlur,
  radius 0.7}` · HueSaturation `-0.08` · ChromaticAberration `[0.0006,0.0010]`
  radial · Vignette `{offset 0.30, darkness 0.85}` · Noise `OVERLAY @0.10`.
  **The Bloom-threshold raise is the #1 fix** — at 0.18 every wall blooms milky.
- **Lightning:** a no-shadow storm `DirectionalLight`; multi-strike envelope
  (peak ~3.5 over ~40–160 ms, 1–3 sub-flashes) every 12–28 s (6–14 s in haunt),
  raise ambient + bg for the peak; thunder SFX delayed by `distance×1s`.
- **Particles:** dust `300 @ size 0.045, opacity 0.22, AdditiveBlending` (glows
  only in light pools); embers near boiler/pentagram (rise + fade, cap 120).
- **Shadows:** only the moonlight casts; `2048` map, `PCFSoft`, `normalBias
  0.03`, ortho frustum fit to explored bounds; walls/furniture/tokens cast,
  floors/small props receive only.
- **Fake AO:** radial-gradient contact-shadow decals under tokens/furniture; lean
  on low ambient + tight falloff for corner darkness.
- **Per-floor fill (one hemisphere each):** upper `#8aa0d0 @0.10` (cold, moonlit),
  ground `#caa874 @0.08` (warm, lived-in), basement `#7a3a3a @0.12` (red, darkest,
  thickest fog).
- **Perf budget:** ≤ ~10 active lights steady-state (hard cap 8 pooled + rig +
  storm); dpr tiers drop shadows/CA/SSAO on low-end.

*Files:* `three/Scene.tsx`, `PostFX.tsx`, `Atmosphere.tsx`, `RoomTile.tsx`,
`decor` `roomTheme()`, and the mirrored vanilla blocks in `artifact/src/game.js`
(remember the artifact uses ~6× point-light intensities).

## 2. Materials & textures

**Contract:** materials stay **fresh-per-call & disposable** (callers dispose on
room clear); only **textures** are cached & shared — safe because
`Material.dispose()` never disposes its textures. **Cache textures, never
materials.**

- `makeTexture(draw, opts)` → `CanvasTexture` with correct `colorSpace`
  (sRGB color maps, linear data maps), repeat/anisotropy. Shared helpers:
  seeded `rng`, `fill`, `mottle` (soft splats), `grain` (per-pixel tooth).
- `materials.*` factory returns tuned `MeshStandardMaterial`s wired to **cached**
  procedural maps, each with a `cheap` param-only fallback + a global
  `setQuality("low")` (artifact/mobile).
- **13 recipes** with concrete canvas steps + `roughness/metalness/emissive/
  bumpScale/tiling`: aged hardwood, cracked stone, peeling wallpaper, stained
  plaster, marble, rusted metal (needs `metalnessMap`), dark iron, tarnished
  gold, blood/grime decals (transparent, `depthWrite:false`), worn rug fabric,
  textured cobweb (`MeshBasic`), glass (physical `transmission` or cheap emissive
  stained-glass map).
- **Tiling trap:** repeat lives on the (shared) texture — bake tiling into the
  cache key (preferred) or `texture.clone()` (shares canvas, own GPU upload).

*Files:* new `decor` material module; route `decor` `mat()`/`emissiveMat()` and
`RoomTile` floor/wall through the factory.

## 3. Decoration — per-room detailing

Take each room from ~7 simple props to **8–16** lived-in, decaying elements,
staying within `±1.6` and keeping the ~1.0-radius centre clear for tokens.

- **New reusable helpers:** `peelingWallpaper`, `wallCrack`⚡, `stainDecal`⚡
  (water/blood/mold/soot), `moldPatch`⚡, `clawMarks`⚡, cobweb variants
  (`cobwebFunnel`/`cobwebStrand`⚡), `scatteredPaper`⚡, `glassShards`⚡,
  `dustPile`/`rubblePile`⚡, `rats`⚡, `skull`/`bonePile`⚡, `bottlesAndJars`⚡,
  `chain`⚡, `drippingCandle`, `framedPortrait`, `tornCurtain`, `brokenWindow`,
  `brokenChair`/`toppledTable`/`debrisPlank`⚡, `floorPuddle`. (⚡ = use
  `InstancedMesh` when >~6 copies.)
- **Per-room sets grouped by theme:** Entrances/circulation (dusty grand decay),
  living quarters (intimate, beds/wardrobes/letters), service/storage (grime,
  barrels, rats, hanging goods), sacred/occult (candles, bones, blood, glow),
  and strange/special (conservatory plants facing the window, mystic-elevator
  cage, vault gold + claw-marked door). Factor shared "decay kit" / "grime kit"
  composers like the existing `dressCorridor`.
- **Perf:** instancing for tiny repeats; decals are thin offset planes
  (`polygonOffset`); keep the ≤1 real light/room budget (extra glow is emissive).

*Files:* `packages/decor/src/index.ts` (helpers + per-room composers).

## 4. Figures, monsters, animation & camera

- **Explorer rig:** taller (~1.62) jointed humanoid; **arms/legs are child groups
  pivoted at the joint** so limbs rotate correctly without a skeleton; tag
  animated parts in `userData`. Per-character archetype silhouettes (surgeon
  apron+head-mirror, strongman bulk+belt, scaled-down big-head child, hooded
  robed monk, shawled medium with floating crystal, photographer with chest
  camera+cap) — all still tinted by character color.
- **Procedural animation (no skeleton):** breathing bob (`sin t*1.6`), gentle
  sway (lean, *not* a full spin — the current spin hides the face), **turn-to-
  face travel** via framerate-independent angle-lerp (`1-k^dt`), a room-change
  **hop** + alternating leg/arm stride, and a generic **hit flash** (white→red
  emissive + recoil). Tween room-to-room moves (~0.35 s ease) so they walk.
- **Active marker:** floor ring (pulsing, slow-spin) + softened beam (0.08) +
  brighter point light, all breathing from one sine.
- **Monsters:** `switch(name)` into distinct builders — **Shade** (floating
  tattered violet shroud, opacity flicker), **Gnashing Maw** (chomping red maw,
  lurch), **The Drowned** (bloated teal boss, dripping limp), **Acolyte** (hooded
  magenta cultist, floating grimoire), **Whisper** (tiny pale swarm wisp,
  swirl) — each with signature glow color (drives the token light), predatory
  slow turn-to-face, attackable presentation + hit/death reactions.
- **Camera director (don't fight OrbitControls):** ease **`controls.target`**
  toward the active player (freeze while the user drags; >0.6 deadzone so idle
  bob doesn't move it); gentle idle drift after 4 s; transient **trauma shake**
  applied *after* `controls.update()` (combat 0.4, kill 0.3, haunt reveal 0.9 +
  quick dolly-in). Respect existing limits.

*Files:* `decor` `buildExplorerFigure`/`buildMonsterFigure` (+ archetype param,
part tagging, per-monster switch); `three/PlayerToken.tsx`, `MonsterToken.tsx`,
`HouseView.tsx` (pass archetype, compute focus), `Scene.tsx` (`<CameraDirector>`).

---

## Notes
- Keep the public decor API stable (`roomTheme`, `buildRoomDecor`,
  `buildExplorerFigure`, `buildMonsterFigure`) so the client and artifact keep
  composing while internals get richer.
- The artifact mirrors these in vanilla three; regenerate it with
  `pnpm build:artifact` after decor changes and port the atmosphere blocks.
- All designs are original to Dread Hollow.
