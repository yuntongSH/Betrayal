import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { buildRoomDecor, roomTheme, buildExplorerFigure, buildMonsterFigure, animateFigure, materials, surfaceFor, attachKeepsake, refineExplorerAvatar, attachAvatarLife, makeStudioEnvTexture, ISLAND_R, RING } from "@dread-hollow/decor";

const DH = window.DH;
const $ = (id) => document.getElementById(id);

// ---- world layout (mirrors the React client) -----------------------------
const TILE = 7;
const WALL_H = 3.2;
const FLOOR_GAP = 11;
const S = TILE / 4; // room-scale factor for effects that were tuned at TILE=4
const FLOOR_Y = { basement: -FLOOR_GAP, ground: 0, upper: FLOOR_GAP };
const TRAIT_COLOR = { speed: "#d8b54a", might: "#c2412f", sanity: "#6fb6b5", knowledge: "#7a6db0" };
// Tokens stand and walk on the decor annulus, never on the island centerpiece:
// slots + travel lane sit mid-annulus, outside ISLAND_R (=1.2) where the props live.
const WALK_R = (RING[0] + RING[1]) / 2; // 1.6
const WALK_SPEED = 2.7; // u/s — constant waypoint-walk pace (stride clip reads right at ~2.4–3.0)
const CARD_HOLD_MS = 5000; // every non-interactive card/death reveal holds this long
const TRAIT_PULSE_MS = 900; // roster value pulse on a trait change
const TRAIT_DELTA_MS = 1600; // floating ±N badge life on the roster chip

// ---- HUD v2 iconography (byte-identical strings in the React client) ------
const LOG_ICON = { info: "✧", move: "⇢", card: "❖", roll: "⚄", haunt: "⌂",
                   combat: "⚔", death: "☠", win: "❦", voice: "❝" }; // keys = LogKind
const TRAIT_ICON = {
  speed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h5v7.5l1.5 1.5h4a3 3 0 0 1 3 3v2H8z"/><path d="M8 5.5C5.8 5.5 4 4.7 2.5 3"/><path d="M8 8.5C6.2 8.5 4.8 7.9 3.5 6.5"/></svg>`,
  might: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 11V9.6a1.5 1.5 0 0 1 3 0V11"/><path d="M10.7 11V8.8a1.5 1.5 0 0 1 3 0V11"/><path d="M13.9 11V9.6a1.5 1.5 0 0 1 3 0V11"/><path d="M6.5 11h10.9a.6.6 0 0 1 .6.6V15c0 3.3-2.4 5.5-5.8 5.5h-1.4C7.6 20.5 6 18.6 6 15.7v-4.1a.6.6 0 0 1 .5-.6z"/><path d="M6 13.2c-1.5.3-2.3 1.2-2.3 2.4 0 1.3.8 2.2 2.3 2.6"/></svg>`,
  sanity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12.5C5.1 8.6 8.3 6.7 12 6.7s6.9 1.9 9.5 5.8c-2.6 3.9-5.8 5.8-9.5 5.8S5.1 16.4 2.5 12.5z"/><path d="M12 9.2c1.5 1.4 2.3 2.6 2.3 3.7a2.3 2.3 0 0 1-4.6 0c0-1.1.8-2.3 2.3-3.7z"/><path d="M12 8.8V7.2"/></svg>`,
  knowledge: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.2C10.2 4.9 8 4.2 5.5 4.2c-1 0-1.9.1-2.7.4v13.8c.8-.3 1.7-.4 2.7-.4 2.5 0 4.7.7 6.5 2 1.8-1.3 4-2 6.5-2 1 0 1.9.1 2.7.4V4.6c-.8-.3-1.7-.4-2.7-.4C16 4.2 13.8 4.9 12 6.2z"/><path d="M12 6.2v13.8"/></svg>`,
};
const prevTraitIdx = {}; // "playerId:trait" -> last-rendered index (drives flash-up/down)
// Trait changes recorded with timestamps: the roster re-renders wholesale after
// every dispatch, so pulses/badges replay mid-flight (negative animation-delay)
// instead of relying on DOM persistence. d is in track STEPS (±1 per notch).
const recentDeltas = []; // { playerId, trait, d, at }
/** Most recent trait change for (player, trait) still inside the badge window. */
function latestDelta(pid, t, now) {
  for (let i = recentDeltas.length - 1; i >= 0; i--) {
    const r = recentDeltas[i];
    if (r.playerId === pid && r.trait === t && now - r.at < TRAIT_DELTA_MS) return r;
  }
  return null;
}
const logSeen = new Map(); // log entry id -> first-rendered ms (feed fade survives rebuilds)
let logOpen = false; // Chronicle: compact toast feed (false) vs full scrolling panel
window.__logToggle = () => { logOpen = !logOpen; render(); };

// ---- Path A: real rigged human models (glTF) -----------------------------
// Maps a character archetype -> a model URL. When present, the wardrobe preview
// and the in-game token load that rigged .glb (with its idle animation) instead
// of the code-built primitive figure. Swap the URL for a Ready Player Me avatar
// (.glb) to ship a real character — the wiring below is identical. (Soldier.glb
// is a three.js example human, MIT-licensed, standing in so the pipeline is
// demonstrable right now; it loads from the browser at runtime over the network.)
// Neutral CC0 humans (Quaternius Universal Base Characters), hosted in-repo.
// Two faced, realistic-proportioned bodies (male/female) themed per character by
// height + tint; they ship in T-pose with no animation, so we lower the arms
// procedurally into a relaxed stance (see attachAvatar). The procedural figure
// is the fallback if a model fails to load.
// Clothed, animated CC0 humans (Quaternius Ultimate Modular Men/Women) — each a
// self-contained glTF with an Idle clip, mapped thematically to our cast and
// themed by height. The procedural figure remains the offline fallback.
const PPL = "models/people";
const EXPLORER_MODELS = {
  crow:   { url: `${PPL}/M_Farmer.gltf`,     h: 1.9 , tint: 0x6b4a2c }, // rustic, burly strongman
  vance:  { url: `${PPL}/W_Formal.gltf`,     h: 1.68, tint: 0x46615f }, // cool clinical grey-teal
  odette: { url: `${PPL}/W_Witch.gltf`,      h: 1.66, tint: 0x4a2d63 }, // deep séance violet
  tobias: { url: `${PPL}/M_King.gltf`,       h: 1.75, tint: 0x40301f }, // dark monk-habit brown
  thorne: { url: `${PPL}/M_Adventurer.gltf`, h: 1.8 , tint: 0x44472c }, // muted field olive
  penny:  { url: `${PPL}/W_Casual.gltf`,     h: 1.36, tint: 0x8a6a30 }, // warm muted amber
};
let POSE_ARM = 1.15; // radians the upper arms drop from T-pose toward the sides
const _gltfLoader = new GLTFLoader();
const _gltfCache = new Map(); // url -> Promise<gltf>
function loadGLTF(url) {
  if (!_gltfCache.has(url)) {
    _gltfCache.set(url, new Promise((res, rej) => _gltfLoader.load(url, res, undefined, rej)));
  }
  return _gltfCache.get(url);
}
// Materials that ARE the person (face, hair, eyes) stay their natural colour —
// tinting them made every face look dyed. Identity colour lands on clothing only.
const PERSON_MATS = /skin|hair|eyebrow|eye|beard|teeth/i;

/** Crossfade the avatar under `group` to the named clip (idle/walk/death/wave).
 *  Safe to call before the async model arrives — the wish is remembered and
 *  applied on load. Death plays once and freezes on the last frame. */
function setAvatarClip(group, name, fade = 0.25) {
  group.userData.wantClip = name;
  const anim = group.userData.anim;
  if (!anim) return;
  // The life layer stills its breath and closes the eyes for the fallen.
  if (group.userData.life) group.userData.life.dead = name === "death";
  const next = anim.actions[name] || anim.actions.idle;
  if (!next || anim.current === next) return;
  next.reset();
  if (name === "death" || name === "wave") {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = name === "death";
  }
  next.fadeIn(fade).play();
  if (anim.current) anim.current.fadeOut(fade);
  anim.current = next;
}

/** Load the avatar for `archetype` into `group` (feet at y=0, ~targetH tall),
 *  registering idle/walk/death/wave clips on group.userData.anim (mixer pushed
 *  to `mixers`). Async — swaps in on load; returns true if a model exists.
 *  opts.greet: open with a wave before settling into idle (lobby wardrobe). */
function attachAvatar(group, archetype, targetH, mixers, opts = {}) {
  const entry = EXPLORER_MODELS[archetype];
  if (!entry) return false;
  const url = entry.url;
  const h = entry.h || targetH;
  const rotY = entry.rotY || 0;
  loadGLTF(url)
    .then((gltf) => {
      const model = cloneSkinned(gltf.scene);
      model.rotation.y = rotY;
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.frustumCulled = false;
        // Per-instance materials so a character's tint can't leak to others that
        // share this body, then lerp the CLOTHES gently toward the identity
        // colour — skin, hair and eyes keep their natural tones.
        if (entry.tint != null) {
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            if (m.color && !PERSON_MATS.test(m.name || "")) m.color.lerp(new THREE.Color(entry.tint), 0.3);
          });
        }
      });
      // Realism pass: smoothed normals, physical materials, per-character
      // grooming, eyelids. After the tint (which it preserves), before the
      // height fit below (its build broadening changes the silhouette).
      refineExplorerAvatar(model, archetype);
      // These bodies load in T-pose with no animation — drop the upper arms to a
      // relaxed stance so they read as a person standing, not a mannequin.
      if (entry.pose) {
        const la = model.getObjectByName("upperarm_l");
        const ra = model.getObjectByName("upperarm_r");
        if (la) la.rotation.z = -POSE_ARM;
        if (ra) ra.rotation.z = POSE_ARM;
      }
      // If a slower load resolves after a newer one (rapid wardrobe hovering),
      // the last to land wins — never two bodies in one group.
      if (group.userData.avatar) group.remove(group.userData.avatar);
      group.add(model);
      group.updateMatrixWorld(true);
      // Skinned-mesh bounds are unreliable until matrices update; measure now,
      // and clamp to a plausible human height if the box came back degenerate.
      let box = new THREE.Box3().setFromObject(model);
      let size = box.max.y - box.min.y;
      if (!(size > 0.3 && size < 6)) size = 1.8; // clamp degenerate skinned bounds
      model.scale.setScalar(h / size);
      group.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(model);
      if (isFinite(box.min.y)) model.position.y -= box.min.y; // feet at the origin
      group.userData.avatar = model;
      if (gltf.animations && gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(model);
        const pick = (re) => {
          const c = gltf.animations.find((a) => re.test(a.name));
          return c ? mixer.clipAction(c) : null;
        };
        const anim = {
          mixer,
          actions: {
            idle: pick(/^idle$/i) || mixer.clipAction(gltf.animations[0]),
            walk: pick(/^walk$/i),
            death: pick(/^death$/i),
            wave: pick(/^wave$/i),
          },
          current: null,
        };
        group.userData.anim = anim;
        // A wardrobe greeting settles into idle once the wave finishes.
        mixer.addEventListener("finished", (e) => {
          if (e.action === anim.actions.wave) setAvatarClip(group, "idle", 0.35);
        });
        const want = group.userData.wantClip;
        setAvatarClip(group, want || (opts.greet && anim.actions.wave ? "wave" : "idle"), 0);
        mixers.push(mixer);
        // Settle the skeleton out of its T-pose bind stance before hanging the
        // keepsake — its attach transform reads the bone's current pose.
        mixer.update(0.03);
      }
      // Their keepsake rides a bone: Thorne's camera, Tobias's lit lantern…
      attachKeepsake(model, archetype);
      // The life layer (breath, attention, blinks, relaxed hands) is additive
      // AFTER the mixer: pushed to the same list, it updates later in the tick.
      const life = attachAvatarLife(model, archetype);
      group.userData.life = life;
      if (group.userData.wantClip === "death") life.dead = true;
      mixers.push(life);
    })
    .catch((e) => console.warn("[avatar] load failed", url, e));
  return true;
}
const tokenAvatarMixers = []; // advanced each frame in animate()
const SPECIAL_GLOW = {
  "heal-sanity": 0x6fb6b5, "heal-might": 0xe8a85a, "drain-speed": 0x5a6f9a,
  pit: 0x3a2a2a, "draw-extra-omen": 0x8c2f23, vault: 0xc8a23a,
};
const DIRS = ["north", "east", "south", "west"];
// Arrows/WASD are interpreted relative to the camera, then snapped to a grid dir.
const SCREEN_KEY = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};
const GRID_AXIS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
function snapGrid(vx, vz) {
  let best = "north", bd = -Infinity;
  for (const d in GRID_AXIS) { const [ax, az] = GRID_AXIS[d]; const dot = vx * ax + vz * az; if (dot > bd) { bd = dot; best = d; } }
  return best;
}
let _toastT;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("show");
  clearTimeout(_toastT); _toastT = setTimeout(() => el.classList.remove("show"), 1500);
}

function roomWorld(r) { return [r.x * TILE, FLOOR_Y[r.floor], r.y * TILE]; }
// A lone occupant stands ON the walk ring (due +z), never dead-center on the
// island prop — [0,0] parked characters on top of the room's centerpiece.
function ring(i, n, rad) { if (n <= 1) return [0, rad]; const a = (i / n) * Math.PI * 2; return [Math.cos(a) * rad, Math.sin(a) * rad]; }

// ---- procedural audio (Web Audio, zero assets) ---------------------------
// A low drone + filtered wind bed, with reactive cues: a creak when a door
// swings, a heartbeat while you're near death, and a dissonant swell when the
// house turns. Must be started from a user gesture (the lobby button click).
const Sound = (() => {
  let ctx = null, master = null, started = false, muted = false, heart = null, lastDoor = 0;
  const VOL = 0.26;
  function noise(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function drone() {
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 210; f.connect(master);
    for (const fr of [49, 55, 73.4]) {
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = fr;
      const g = ctx.createGain(); g.gain.value = 0.16; o.connect(g).connect(f); o.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.04 + Math.random() * 0.05;
      const lg = ctx.createGain(); lg.gain.value = 0.07; lfo.connect(lg).connect(g.gain); lfo.start();
    }
  }
  function wind() {
    const s = ctx.createBufferSource(); s.buffer = noise(4); s.loop = true;
    const b = ctx.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = 460; b.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.1; s.connect(b).connect(g).connect(master); s.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lg = ctx.createGain(); lg.gain.value = 240; lfo.connect(lg).connect(b.frequency); lfo.start();
  }
  function creak(freq, dur, vol) {
    if (!started || muted) return;
    const s = ctx.createBufferSource(); s.buffer = noise(dur + 0.1);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 7;
    const g = ctx.createGain(); g.gain.value = 0;
    const t = ctx.currentTime;
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(); s.stop(t + dur + 0.1);
  }
  function thump(t, vol) {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.32);
  }
  return {
    start() {
      if (started) return;
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      ctx = new C(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      started = true; drone(); wind();
      master.gain.linearRampToValueAtTime(muted ? 0 : VOL, ctx.currentTime + 4);
    },
    door() { const now = performance.now(); if (now - lastDoor < 350) return; lastDoor = now; creak(330 + Math.random() * 220, 0.6, 0.22); },
    setHeart(on) {
      if (!started) return;
      if (on && !heart && !muted) {
        const beat = () => { if (muted) return; const t = ctx.currentTime; thump(t, 0.55); thump(t + 0.33, 0.4); };
        beat(); heart = setInterval(beat, 1150);
      } else if (!on && heart) { clearInterval(heart); heart = null; }
    },
    stinger() {
      if (!started || muted) return;
      const t = ctx.currentTime;
      for (const fr of [110, 116.5, 220]) {
        const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = fr;
        const f = ctx.createBiquadFilter(); f.type = "lowpass";
        f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1900, t + 0.7);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.13, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 2.3);
        o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 2.4);
      }
      const s = ctx.createBufferSource(); s.buffer = noise(2.2);
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2600;
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.09, t + 0.2); g2.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
      s.connect(hp).connect(g2).connect(master); s.start(t); s.stop(t + 2.2);
    },
    /** Short reveal sting per card type — item plucks, event chimes, omen dread. */
    cardSting(type) {
      if (!started || muted) return;
      const t = ctx.currentTime;
      const note = (freq, at, wave, vol, dur) => {
        const o = ctx.createOscillator(); o.type = wave; o.frequency.value = freq;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(vol, at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, at + dur);
        o.connect(g).connect(master); o.start(at); o.stop(at + dur + 0.05);
      };
      if (type === "item") { note(660, t, "triangle", 0.18, 0.5); note(880, t + 0.09, "triangle", 0.18, 0.5); }
      else if (type === "event") { [523, 415, 311].forEach((f, i) => note(f, t + i * 0.12, "sine", 0.14, 0.4)); }
      else {
        for (const fr of [65, 69]) {
          const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = fr;
          const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 400;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.2, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
          o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 1.3);
        }
        const s = ctx.createBufferSource(); s.buffer = noise(0.8);
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2400;
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.06, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        s.connect(hp).connect(g2).connect(master); s.start(t); s.stop(t + 0.85);
      }
    },
    /** A bell struck twice for a fallen explorer. */
    deathKnell() {
      if (!started || muted) return;
      const t0 = ctx.currentTime;
      for (const at of [t0, t0 + 0.7]) {
        const o = ctx.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(98, at); o.frequency.exponentialRampToValueAtTime(82, at + 0.5);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.3, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 2.2);
        o.connect(g).connect(master); o.start(at); o.stop(at + 2.3);
      }
    },
    setMuted(m) {
      muted = m;
      if (ctx && master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(m ? 0 : VOL, ctx.currentTime + 0.5); }
      if (m) this.setHeart(false);
    },
    toggle() { this.setMuted(!muted); return muted; },
    get muted() { return muted; },
    get started() { return started; },
  };
})();

/** Reflect sound state on the toggle button (🔊 on / 🔇 off). */
function syncSoundBtn() {
  const b = document.getElementById("sound-btn");
  if (!b) return;
  const on = Sound.started && !Sound.muted;
  b.textContent = on ? "🔊" : "🔇";
  b.classList.toggle("off", !on);
}

// =========================================================================
// BEATS — cinematic presentation of draws, deaths, discoveries and the haunt.
// Beats are derived by diffing a pre-action snapshot against the post-action
// state (the engine stays untouched); card/death beats are modal card-flip
// overlays, discoveries and special rooms are non-blocking toasts, and the
// existing haunt banner is gated until the modal queue drains.
// =========================================================================
const BEAT_SVG = {
  item: `<svg viewBox="0 0 24 24"><path d="M15.5 2a6.5 6.5 0 0 0-6.2 8.5l-7 7V22h4.5v-2.5H9.3V17h2.5l1.4-1.4A6.5 6.5 0 1 0 15.5 2zm2 3.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z"/></svg>`,
  event: `<svg viewBox="0 0 24 24"><path d="M12 5C6.5 5 2.3 9.4 1 12c1.3 2.6 5.5 7 11 7s9.7-4.4 11-7c-1.3-2.6-5.5-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`,
  omen: `<svg viewBox="0 0 24 24"><path d="M12 2a8 8 0 0 0-8 8c0 3 1.6 5.5 4 6.8V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3.2c2.4-1.3 4-3.8 4-6.8a8 8 0 0 0-8-8zM8.5 10a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm7 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM11 17.5h2V20h-2v-2.5z"/></svg>`,
};
const BEAT_KICKER = { item: "An Item found", event: "An Event unfolds", omen: "An Omen uncovered" };
const BEAT_LIGHT = { item: 0xe2a85a, event: 0x8f6fd8, omen: 0xc2412f, death: 0x7a1010, haunt: 0xa01818, discovery: 0xd8c090 };
const fxList = []; // live in-room beat FX (light pulses + ember bursts), stepped in animate()

/** Spawn the in-3D accompaniment for a beat: a light pulse at the room's heart
 *  and (for modal beats) a rising ember burst in the card's colour. */
function spawnBeatFx(roomKey, type, embers = true) {
  const room = state && roomKey ? state.house[roomKey] : null;
  if (!room || !scene) return;
  const [wx, wy, wz] = roomWorld(room);
  const color = BEAT_LIGHT[type] ?? 0xe2a85a;
  const light = new THREE.PointLight(color, 0, TILE * 2.4, 2);
  light.position.set(wx, wy + 1.7, wz);
  scene.add(light);
  fxList.push({ kind: "pulse", light, t: 0 });
  if (!embers) return;
  const N = 90;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5 * S;
    pos[i * 3] = wx + Math.cos(a) * r;
    pos[i * 3 + 1] = wy + 0.25 * S;
    pos[i * 3 + 2] = wz + Math.sin(a) * r;
    const ha = Math.random() * Math.PI * 2, hs = (0.15 + Math.random() * 0.55) * S;
    vel[i * 3] = Math.cos(ha) * hs;
    vel[i * 3 + 1] = (1.0 + Math.random() * 1.2) * S;
    vel[i * 3 + 2] = Math.sin(ha) * hs;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07 * S, color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  scene.add(pts);
  fxList.push({ kind: "embers", points: pts, vel, t: 0 });
}

const Beats = (() => {
  let CARD_BY_NAME = null; // card name -> def, built lazily (all 35 names unique)
  const queue = []; // pending modal beats (card / death)
  let active = null; // the modal currently on screen
  let gapTimer = null, autoTimer = null;
  const consumed = new Set(); // log entry ids already surfaced as beats (skip bot toasts)
  const director = { focusKey: null, until: 0 }; // camera push-in singleton

  function cardByName(name) {
    if (!CARD_BY_NAME) CARD_BY_NAME = new Map(DH.ALL_CARDS.map((c) => [c.name, c]));
    return CARD_BY_NAME.get(name);
  }
  /** Whose experience we frame: the solo human, else the active hotseat human. */
  function watched(s) {
    const humans = s.players.filter((p) => !p.isBot);
    if (humans.length === 1) return humans[0];
    const a = s.players.find((p) => p.id === s.activePlayerId);
    return a && !a.isBot ? a : null;
  }
  function focusPulse(roomKey, ms = 1600) {
    if (!roomKey) return;
    director.focusKey = roomKey;
    director.until = performance.now() + ms;
  }
  function flashVignette(type) {
    const v = document.querySelector("#beat-layer .beat-vignette");
    if (!v) return;
    v.className = "beat-vignette " + type;
    void v.offsetWidth; // force reflow so the flash animation restarts
    v.classList.add("flash");
  }
  function beatToast(glyph, text, bc) {
    const wrap = document.querySelector("#beat-layer .beat-toasts");
    if (!wrap) return;
    while (wrap.children.length >= 2) wrap.removeChild(wrap.firstChild); // oldest drops
    const el = document.createElement("div");
    el.className = "beat-toast";
    el.style.setProperty("--bc", bc);
    el.innerHTML = `<span>${glyph}</span><span>${text}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 550); }, 2400);
  }

  // Every modal offers "Continue ▸" — a bot's draw auto-dismisses after
  // CARD_HOLD_MS (the .card-timer bar drains along the bottom edge to show it)
  // but a click / Continue / Enter / Space always advances immediately.
  function cardHtml(b) {
    return `<div class="card-flip"><div class="draw-card t-${b.cardType}">` +
      `<div class="dc-icon">${BEAT_SVG[b.cardType]}</div>` +
      `<div class="dc-kicker">${BEAT_KICKER[b.cardType]}</div>` +
      `<div class="dc-name">${b.name}</div>` +
      `<div class="dc-text">${b.text}</div>` +
      `<div class="dc-holder">${b.playerName} draws</div>` +
      `<button class="btn primary dc-continue">Continue ▸</button>` +
      (b.interactive ? "" : `<div class="card-timer" style="animation-duration:${CARD_HOLD_MS}ms"></div>`) +
      `</div></div>`;
  }
  function deathHtml(b) {
    const c = DH.CHARACTERS_BY_ID[b.charId];
    return `<div class="death-banner">` +
      `<div class="db-disc" style="--pc:${c?.color ?? "#888"}">${c?.name.charAt(0) ?? "?"}</div>` +
      `<div class="kick">LOST TO THE HOUSE</div>` +
      `<h2>${c?.name ?? b.playerName}</h2>` +
      `<div class="muted">${c?.title ?? ""}</div>` +
      `<div class="db-words">“${c?.lines.death ?? "…"}”</div>` +
      `<button class="btn primary dc-continue">Continue ▸</button>` +
      (b.interactive ? "" : `<div class="card-timer" style="animation-duration:${CARD_HOLD_MS}ms"></div>`) +
      `</div>`;
  }
  function showNext() {
    if (active || !queue.length) return;
    const b = (active = queue.shift());
    const layer = $("beat-layer");
    if (!layer) { active = null; return; }
    const type = b.kind === "death" ? "death" : b.cardType;
    const back = document.createElement("div");
    back.className = "card-reveal";
    back.innerHTML = b.kind === "death" ? deathHtml(b) : cardHtml(b);
    // Interactive modals only dismiss from the backdrop/Continue/Enter; a bot's
    // beat auto-dismisses and any click skips it early.
    back.onclick = (e) => { if (!b.interactive || e.target === back) dismiss(); };
    const cont = back.querySelector(".dc-continue");
    if (cont) cont.onclick = dismiss;
    layer.appendChild(back);
    b.el = back;
    flashVignette("t-" + type);
    focusPulse(b.roomKey);
    spawnBeatFx(b.roomKey, type);
    if (b.kind === "death") Sound.deathKnell();
    else Sound.cardSting(b.cardType);
    // Every reveal gets its full reading time — no backlog fast-drain (driveBots
    // pauses while a beat is up, so the queue stays bounded regardless).
    if (!b.interactive) autoTimer = setTimeout(dismiss, CARD_HOLD_MS);
  }
  function dismiss() {
    if (!active) return;
    clearTimeout(autoTimer); autoTimer = null;
    active.el?.remove();
    active = null;
    // A short breath between consecutive modals; when the queue drains the
    // re-render lets a gated haunt banner finally appear.
    gapTimer = setTimeout(() => {
      gapTimer = null;
      if (queue.length) showNext();
      else render();
    }, 250);
  }

  /** One toast per room entry — its standing aura wins over its special. */
  function specialToast(def, discovered) {
    if (!def) return;
    if (def.aura > 0) return beatToast("✦", `Blessed ground — +${def.aura} die to every roll here`, "#e2c15a");
    if (def.aura < 0) return beatToast("☓", `Cursed ground — ${def.aura} dice to every roll here`, "#c2412f");
    const sp = def.special;
    if (sp === "mystic-elevator") return beatToast("⇅", "The Mystic Elevator — it can carry you to another floor", "#8f6fd8");
    if (sp === "grand-staircase" || sp === "stairs-up" || sp === "stairs-down") return beatToast("⇗", "Stairs — change floors here", "#e2a85a");
    if (sp === "vault") return beatToast("🗝", "A sealed vault — it wants the Iron Key", "#e2a85a");
    if (!discovered) return;
    if (sp === "heal-might") return beatToast("✚", "+1 Might", "#7fae6a");
    if (sp === "heal-sanity") return beatToast("✚", "+1 Sanity", "#7fae6a");
    if (sp === "drain-speed") return beatToast("▼", "−1 Speed", "#c2412f");
    if (sp === "pit") return beatToast("▼", "−1 Might", "#c2412f");
  }

  return {
    director,
    consumed,
    focusPulse,
    idle: () => !active && queue.length === 0,
    skip: dismiss,
    /** New game: drop queued beats and consumed ids (log ids restart at 1). */
    reset() {
      queue.length = 0;
      clearTimeout(autoTimer); autoTimer = null;
      clearTimeout(gapTimer); gapTimer = null;
      if (active) { active.el?.remove(); active = null; }
      consumed.clear();
      recentDeltas.length = 0;
      director.focusKey = null; director.until = 0;
    },
    /** Pre-action snapshot — everything ingest() needs to diff afterwards. */
    snap(s) {
      return {
        nextLogId: s.nextLogId,
        hauntId: s.haunt?.id ?? null,
        houseKeys: new Set(Object.keys(s.house)),
        pos: Object.fromEntries(s.players.map((p) => [p.id, p.position])),
        alive: Object.fromEntries(s.players.map((p) => [p.id, p.alive])),
        traitIdx: Object.fromEntries(s.players.map((p) => [p.id, { ...p.traitIndex }])),
      };
    },
    /** Diff snapshot vs post-action state into beats (log order = causal order). */
    ingest(snap, next) {
      const w = watched(next);
      const byName = (n) => next.players.find((p) => p.name === n) ?? next.players.find((p) => p.id === next.activePlayerId);
      const pushCard = (e, cardType, name, who) => {
        const p = byName(who);
        const card = cardByName(name);
        queue.push({
          kind: "card", cardType, name,
          text: card?.text ?? e.text,
          playerId: p?.id ?? null, playerName: p?.name ?? who,
          roomKey: p?.position ?? null,
          interactive: !!w && p?.id === w.id,
        });
        consumed.add(e.id);
      };
      const fresh = next.log.filter((e) => e.id >= snap.nextLogId);
      const deadSeen = new Set(); // several deaths in one action each get a banner
      for (const e of fresh) {
        let m;
        if (e.kind === "move" && (m = e.text.match(/^(.+) discovers the (.+)\.$/))) {
          const p = byName(m[1]);
          // Belt and braces: only a genuinely new room key counts as a discovery.
          if (p?.position && !snap.houseKeys.has(p.position)) {
            consumed.add(e.id);
            beatToast("◈", `Discovered — ${m[2]}`, "#d8c090");
            focusPulse(p.position);
            spawnBeatFx(p.position, "discovery", false);
            Sound.door();
          }
        } else if (e.kind === "card" && (m = e.text.match(/^(.+) triggers an Event — (.+?): /))) {
          pushCard(e, "event", m[2], m[1]);
        } else if (e.kind === "card" && (m = e.text.match(/^(.+) picks up an Item — (.+)\.$/))) {
          pushCard(e, "item", m[2], m[1]);
        } else if (e.kind === "card" && (m = e.text.match(/^(.+) uncovers an Omen — (.+)\.$/))) {
          pushCard(e, "omen", m[2], m[1]);
        } else if (e.kind === "card" && (m = e.text.match(/^(.+) turns up (.+)!$/))) {
          pushCard(e, "item", m[2], m[1]); // search success
        } else if (e.kind === "card" && (m = e.text.match(/^The Iron Key turns\. (.+) loots the vault!$/))) {
          // No standard string carries the card name — the prize is the item
          // just appended to the looter's inventory.
          const p = byName(m[1]);
          const card = p?.inventory.length ? DH.getCard(p.inventory[p.inventory.length - 1]) : null;
          queue.push({
            kind: "card", cardType: "item",
            name: card?.name ?? "The vault yields a prize",
            text: card?.text ?? e.text,
            playerId: p?.id ?? null, playerName: p?.name ?? m[1],
            roomKey: p?.position ?? null,
            interactive: !!w && p?.id === w.id,
          });
          consumed.add(e.id);
        } else if (e.kind === "death" && (m = e.text.match(/^(.+) has been lost to the house\.$/))) {
          // Confirm against the alive-flag diff — the named player really fell.
          const p = next.players.find((q) => q.name === m[1] && snap.alive[q.id] && !q.alive && !deadSeen.has(q.id))
            ?? next.players.find((q) => snap.alive[q.id] && !q.alive && !deadSeen.has(q.id));
          if (p) {
            deadSeen.add(p.id);
            queue.push({
              kind: "death", charId: p.characterId,
              playerId: p.id, playerName: p.name,
              roomKey: p.position,
              interactive: !!w && p.id === w.id,
            });
            consumed.add(e.id);
          }
        }
      }
      // The haunt is a state diff, not a log line: fire the room FX now, and the
      // existing full-screen banner appears once the modal queue drains.
      if (snap.hauntId === null && next.haunt) {
        const key = next.haunt.startRoomKey ?? next.players.find((p) => p.id === next.activePlayerId)?.position;
        focusPulse(key, 2600);
        spawnBeatFx(key, "haunt");
        flashVignette("t-haunt");
      }
      // Special-room toast when the watched explorer walks somewhere notable.
      if (w && w.position && w.position !== snap.pos[w.id]) {
        const room = next.house[w.position];
        const def = room ? DH.ROOMS_BY_ID[room.roomId] : null;
        specialToast(def, !snap.houseKeys.has(w.position));
      }
      // ANY player's trait change → roster pulse + delta badge + a floating
      // "−1 Knowledge" over the 3D character. Deltas are in track steps.
      const tNow = performance.now();
      for (const p of next.players) {
        const was = snap.traitIdx[p.id];
        if (!was) continue;
        for (const t of DH.TRAITS) {
          const d = (p.traitIndex[t] ?? 0) - (was[t] ?? 0);
          if (d) {
            recentDeltas.push({ playerId: p.id, trait: t, d, at: tNow });
            spawnStatFloat(p.id, t, d);
          }
        }
      }
      while (recentDeltas.length && tNow - recentDeltas[0].at > TRAIT_DELTA_MS * 4) recentDeltas.shift();
      if (!active && !gapTimer) showNext();
    },
  };
})();

/** Every game action flows through here so beats can diff before/after. */
function dispatch(action) {
  const snap = Beats.snap(state);
  DH.reduce(state, action);
  Beats.ingest(snap, state);
}

// =========================================================================
// LEGACY CAMPAIGN — a persistent saga of linked games, saved in the browser
// =========================================================================
const CAMP_KEY = "dh:campaign";
const TRAIT_NAMES = ["speed", "might", "sanity", "knowledge"];
function loadCampaign() { try { return JSON.parse(localStorage.getItem(CAMP_KEY) || "null"); } catch { return null; } }
function saveCampaign(c) { try { localStorage.setItem(CAMP_KEY, JSON.stringify(c)); } catch { /* storage off */ } }
function newCampaign(humanCharId) { return { chapter: 1, humanCharId, families: {}, heirlooms: [], scars: {}, chronicle: [] }; }

/** Translate the saved campaign into the engine's per-game modifier object. */
function campaignModifiers(c) {
  const bloodlines = {};
  for (const id in c.families) bloodlines[id] = { generation: c.families[id].gen, bonus: c.families[id].bonus || {} };
  return { heirlooms: c.heirlooms.map((h) => ({ ...h })), bloodlines, scars: { ...c.scars } };
}

/** Which trait an item steadies its bearer in (drives the heirloom bonus). */
function heirloomTrait(cardId) {
  const e = DH.getCard(cardId)?.effect;
  if (e?.kind === "item-passive" && e.trait) return e.trait;
  if (e?.kind === "consumable" && e.use?.kind === "heal") return e.use.trait;
  return "might";
}

function closeModals() {
  for (const id of ["campaign-overlay", "legacy-overlay", "help-overlay"]) $(id).classList.remove("show");
}

/** Start (or continue) the legacy and show the saga screen. */
function openLegacy() {
  campaign = loadCampaign();
  if (!campaign) {
    const humanChar = (party[0] && party[0].charId) || DH.CHARACTERS[0].id;
    campaign = newCampaign(humanChar);
    saveCampaign(campaign);
  }
  renderCampaignScreen();
  $("campaign-overlay").classList.add("show");
}

function renderCampaignScreen() {
  const c = campaign;
  const fam = DH.CHARACTERS_BY_ID[c.humanCharId];
  const famState = c.families[c.humanCharId] || { gen: 1, bonus: {} };
  const heir = c.heirlooms.length
    ? `<ul class="camp-list">${c.heirlooms.map((h) => `<li><b>${h.name}</b> <span class="camp-gen">— ${DH.CHARACTERS_BY_ID[h.charId]?.name.split(" ").pop() ?? "family"}, +${h.level} ${h.trait}</span></li>`).join("")}</ul>`
    : `<div class="camp-empty">No heirlooms forged yet.</div>`;
  const scarIds = Object.keys(c.scars);
  const scars = scarIds.length
    ? `<ul class="camp-list">${scarIds.map((rid) => `<li><b>${DH.ROOMS_BY_ID[rid]?.name ?? rid}</b> <span class="camp-gen">— ${c.scars[rid]}</span></li>`).join("")}</ul>`
    : `<div class="camp-empty">The house is unmarked… for now.</div>`;
  const chron = c.chronicle.length
    ? c.chronicle.slice(-8).map((l) => `<div class="chronicle-line">${l}</div>`).join("")
    : `<div class="camp-empty">The saga has yet to be written.</div>`;
  const bonusTxt = TRAIT_NAMES.filter((t) => famState.bonus[t]).map((t) => `+${famState.bonus[t]} ${t}`).join(", ");
  $("campaign-body").innerHTML =
    `<div class="camp-chapter">Chapter ${c.chapter}</div>` +
    `<h2>The ${fam.name.split(" ").pop()} Legacy</h2>` +
    `<p class="camp-fam"><span>You play <b>${fam.name}</b></span><span class="camp-gen">generation ${famState.gen}${bonusTxt ? " · " + bonusTxt : ""}</span></p>` +
    `<div class="camp-sec">Heirlooms</div>${heir}` +
    `<div class="camp-sec">The house remembers</div>${scars}` +
    `<div class="camp-sec">Chronicle</div>${chron}` +
    `<button class="btn primary" id="camp-descend">Descend into Chapter ${c.chapter}</button> ` +
    `<button class="btn" id="camp-close">Not yet</button> ` +
    `<button class="btn danger" id="camp-abandon">Abandon the legacy</button>`;
  $("camp-descend").onclick = () => beginChapter();
  $("camp-close").onclick = closeModals;
  $("camp-abandon").onclick = () => {
    if (confirm("Abandon this legacy? The saga will be lost.")) { try { localStorage.removeItem(CAMP_KEY); } catch {} campaign = null; closeModals(); }
  };
}

/** Begin a campaign chapter: solo game with the saga's carry-over applied. */
function beginChapter() {
  if (!campaign) return;
  inCampaign = true; legacyShown = false;
  Beats.reset(); logSeen.clear(); // fresh game, fresh (restarted) log ids
  state = DH.createGame("legacy", (Math.random() * 1e9) | 0);
  state.difficulty = chosenDifficulty;
  const human = campaign.humanCharId;
  const pid = "p" + human;
  DH.reduce(state, { type: "join", playerId: pid, name: DH.CHARACTERS_BY_ID[human].name });
  DH.reduce(state, { type: "choose-character", playerId: pid, characterId: human });
  for (let i = 0; i < 3; i++) DH.reduce(state, { type: "add-bot", playerId: pid });
  state.campaign = campaignModifiers(campaign); // applied at start-game
  DH.reduce(state, { type: "start-game", playerId: state.players[0].id });
  closeModals();
  $("lobby").style.display = "none";
  $("game").style.display = "block";
  Sound.start(); syncSoundBtn();
  if (!renderer) initScene();
  onResize();
  render();
  driveBots();
}

/** Resolve a finished chapter: record it, scar the house, advance bloodlines,
 *  then let the player forge an heirloom before the next chapter. */
function showLegacyEnd() {
  if (legacyShown || !campaign) return;
  legacyShown = true;
  const c = campaign;
  const haunt = state.haunt;
  const heroesWon = state.winner === "heroes";
  const hn = haunt ? haunt.name : "the dark";
  c.chronicle.push(
    `Chapter ${c.chapter} — ${hn}: ` +
    (heroesWon ? "the household survived." : (haunt && haunt.traitorIds.length === 0 ? "the house consumed them." : "the traitor triumphed.")),
  );
  // Scar the room where the haunt began — cursed ground ever after.
  if (haunt && haunt.startRoomKey && state.house[haunt.startRoomKey]) {
    const rid = state.house[haunt.startRoomKey].roomId;
    if (!c.scars[rid]) c.scars[rid] = `Marked in Chapter ${c.chapter}, when ${hn} began here.`;
  }
  // Every family that fell this chapter passes to a hardier heir.
  for (const p of state.players) {
    if (!p.characterId) continue;
    const fam = c.families[p.characterId] || (c.families[p.characterId] = { gen: 1, bonus: {} });
    if (!p.alive) {
      fam.gen += 1;
      const t = TRAIT_NAMES[(Math.random() * 4) | 0];
      fam.bonus[t] = Math.min(3, (fam.bonus[t] || 0) + 1);
    }
  }
  saveCampaign(c);
  renderLegacyOverlay();
  $("legacy-overlay").classList.add("show");
}

function renderLegacyOverlay() {
  const c = campaign;
  const me = state.players.find((p) => p.characterId === c.humanCharId);
  const heroesWon = state.winner === "heroes";
  const title = heroesWon ? "The household endures" : (state.haunt && state.haunt.traitorIds.length === 0 ? "The house has fed" : "The betrayal is complete");
  const survivedItems = me && me.alive ? me.inventory.filter((id) => DH.getCard(id)) : [];
  const forgeable = [...new Set(survivedItems)];
  let body =
    `<div class="camp-chapter">Chapter ${c.chapter} ends</div>` +
    `<h2>${title}</h2>` +
    `<div class="chronicle-line">${c.chronicle[c.chronicle.length - 1]}</div>`;
  if (me && me.alive && forgeable.length) {
    body += `<div class="camp-sec">Claim an heirloom</div>` +
      `<p class="camp-empty">Name one item your line carried through — it will pass down, stronger.</p>` +
      `<div class="legacy-pick" id="legacy-pick">` +
      forgeable.map((id) => {
        const existing = c.heirlooms.find((h) => h.cardId === id && h.charId === c.humanCharId);
        const lbl = existing ? `${existing.name} (strengthen)` : (DH.getCard(id)?.name ?? id);
        return `<button class="btn" data-card="${id}">${lbl}</button>`;
      }).join("") + `</div><div id="forge-slot"></div>`;
  } else {
    body += `<p class="camp-empty">${me && me.alive ? "Your bearer carries nothing to pass down this time." : "Your bearer did not survive — a hardier heir will take up the name."}</p>`;
  }
  body += `<button class="btn primary" id="legacy-continue">Continue the saga →</button>`;
  $("legacy-body").innerHTML = body;
  $("legacy-continue").onclick = () => advanceChapter();
  for (const b of document.querySelectorAll("#legacy-pick .btn")) {
    b.onclick = () => promptForge(b.dataset.card);
  }
}

function promptForge(cardId) {
  const c = campaign;
  const existing = c.heirlooms.find((h) => h.cardId === cardId && h.charId === c.humanCharId);
  const def = DH.getCard(cardId);
  const slot = $("forge-slot");
  slot.innerHTML =
    `<div class="heir-name-row"><input id="heir-name" maxlength="34" value="${existing ? existing.name : (def?.name ?? "Heirloom")}" />` +
    `<button class="btn primary" id="heir-forge">${existing ? "Strengthen" : "Forge"}</button></div>` +
    `<div class="camp-empty">It will steady its bearer's ${heirloomTrait(cardId)}.</div>`;
  $("heir-forge").onclick = () => {
    const name = ($("heir-name").value || def?.name || "Heirloom").slice(0, 34);
    if (existing) { existing.level = Math.min(3, existing.level + 1); existing.name = name; }
    else c.heirlooms.push({ cardId, charId: c.humanCharId, name, trait: heirloomTrait(cardId), level: 1 });
    saveCampaign(c);
    // lock the choice in
    $("legacy-pick").querySelectorAll(".btn").forEach((x) => (x.disabled = true));
    slot.innerHTML = `<div class="chronicle-line">“${name}” is bound to your line.</div>`;
  };
}

function advanceChapter() {
  if (!campaign) return;
  campaign.chapter += 1;
  saveCampaign(campaign);
  inCampaign = false;
  closeModals(); // dismiss the legacy overlay before showing the saga screen
  $("game").style.display = "none";
  $("lobby").style.display = "block";
  renderCampaignScreen();
  $("campaign-overlay").classList.add("show");
}

// ---- game state ----------------------------------------------------------
let state = null;
let chosenDifficulty = "standard"; // set in the lobby; scales the haunt
let campaign = null;      // loaded legacy campaign (when playing a saga)
let inCampaign = false;   // is the current game a campaign chapter?
let legacyShown = false;  // has this chapter's end-of-chapter screen shown?
let lastHauntShown = null;
let lastStinger = null; // haunt id whose reveal stinger has already played
let botTimer = null; // pending local bot step
let lastBotId = null; // which bot we're currently watching (for turn-handoff beats)
// Bot pacing — slow enough for a human to follow what each player is doing: a
// longer beat when a NEW bot takes over, steady steps within that bot's turn.
const BOT_STEP_MS = 1150;
const BOT_TURN_START_MS = 1550;
const party = []; // { pid, charId }

// ---- three.js objects ----------------------------------------------------
let scene, camera, renderer, labelRenderer, controls, raycaster, pointer;
let houseGroup, tokenGroup, arrowGroup, doorGroup;
let dust, wisps = [];
const tokenCache = new Map(); // entity id -> persistent token group (lerped toward its target)
let lastFrameT = 0;
const roomCache = new Map(); // key -> { group, floorMat, labelEl } built once per room
const doorCache = new Map(); // boundary id -> { group, pivot, open, openTarget, closeAt }
const camDesired = new THREE.Vector3(0, 0, 7); // soft camera-follow target
let userCamAt = 0; // performance.now() of the last manual orbit/zoom — pauses auto-follow
const camOffset = new THREE.Vector3(); // scratch for the cinematic dolly math
// Follow-cam state machine: TACTICAL ⇄ CHASE as one scalar (+ debounce clocks),
// swooping low behind the active explorer while they walk. Values mirror the
// React client's CameraDirector exactly.
const CHASE_DIST = 7.0;
const CHASE_PHI = 1.12; // rad polar — ≈26° above horizon, just over the walls
let chase = 0, chaseWant = 0, movingFor = 0, stillFor = 9;
let polarSaved = 0.94; // the user's remembered tactical tilt (matches initial cam)
const camSph = new THREE.Spherical();
const camLook = new THREE.Vector3();
// Single source of truth for "is the active explorer walking" — written each
// frame by the active token in the animate loop, consumed by the camera.
const followTarget = { pos: new THREE.Vector3(), yaw: 0, moving: false, valid: false };
// X-ray walls: every room-perimeter wall mesh PLUS each doorway's stubs and
// header, tagged so any of them between the camera and a living character can
// ghost to 0.12 opacity. Door leaves, jambs and decor never fade.
const xrayWalls = []; // flat registry, rebuilt whenever the room/door count changes
let xrayUnitCount = 0; // rooms + doors last time the registry was rebuilt
const XRAY_OPACITY = 0.12;
const XRAY_HOLD_MS = 250; // absorbs single-frame raycast flicker
const xrayRay = new THREE.Ray();
const xrayDir = new THREE.Vector3();
const xrayHit = new THREE.Vector3();

// =========================================================================
// LOBBY
// =========================================================================
function buildLobby() {
  const grid = $("char-grid");
  grid.innerHTML = "";
  DH.CHARACTERS.forEach((c) => {
    const chosen = party.some((p) => p.charId === c.id);
    const card = document.createElement("button");
    card.className = "char-card" + (chosen ? " mine" : "");
    card.style.borderColor = c.color;
    card.innerHTML =
      `<div class="char-avatar" style="background:${c.color}">${c.name.charAt(0)}</div>` +
      `<div class="char-info"><strong>${c.name}</strong><em>${c.title}</em>` +
      `<div class="char-traits">` +
      DH.TRAITS.map((t) => `<span class="trait-chip">${t.slice(0, 3)} ${c.traits[t].values[c.traits[t].start]}</span>`).join("") +
      `</div></div>`;
    card.onmouseenter = () => wardrobeShow(c.id);
    card.onclick = () => toggleParty(c.id);
    grid.appendChild(card);
  });
  $("begin-btn").disabled = party.length < 1;
  $("party-count").textContent = party.length;
}

function beginGame(solo) {
  stopWardrobe();
  inCampaign = false; // a one-off game is not part of a legacy
  Beats.reset(); logSeen.clear(); // fresh game, fresh (restarted) log ids
  state = DH.createGame("local", (Math.random() * 1e9) | 0);
  state.difficulty = chosenDifficulty; // applied when the house turns
  let roster = solo ? party.slice(0, 1) : party.slice();
  if (roster.length === 0) {
    roster = [{ pid: "p" + DH.CHARACTERS[0].id, charId: DH.CHARACTERS[0].id }];
  }
  roster.forEach((p) => {
    const name = DH.CHARACTERS_BY_ID[p.charId].name;
    DH.reduce(state, { type: "join", playerId: p.pid, name });
    DH.reduce(state, { type: "choose-character", playerId: p.pid, characterId: p.charId });
  });
  // Solo = 1 human + 3 bots; hotseat auto-fills to a minimum of 3 on start.
  if (solo) {
    for (let i = 0; i < 3; i++) {
      DH.reduce(state, { type: "add-bot", playerId: roster[0].pid });
    }
  }
  DH.reduce(state, { type: "start-game", playerId: state.players[0].id });
  $("lobby").style.display = "none";
  $("game").style.display = "block";
  Sound.start(); // the button click is our user gesture for Web Audio
  syncSoundBtn();
  if (!renderer) initScene();
  onResize();
  render();
  driveBots();
}

// =========================================================================
// SCENE
// =========================================================================
function initScene() {
  const wrap = $("canvas-wrap");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040407);
  // Tighter fog: rooms far from any explorer's light fall away into the dark.
  scene.fog = new THREE.Fog(0x05050a, 16, 60);

  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
  camera.position.set(21, 24, 32);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Filmic tone mapping + sRGB output so candle/accent point-lights roll off
  // instead of clipping to flat white, recovering mid-tone contrast on surfaces.
  // (The React client gets this for free from R3F's <Canvas> defaults.)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  wrap.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "label-layer";
  wrap.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 7);
  controls.maxPolarAngle = 1.45;
  controls.minDistance = 5; // must stay ≤ CHASE_DIST so the swoop can land
  controls.maxDistance = 100;
  // When the user grabs the camera, pause the auto cinematic follow for a beat
  // so the dolly never fights their orbit/zoom; it resumes once they let go.
  controls.addEventListener("start", () => { userCamAt = performance.now(); });

  // Near-black base lighting: the house is lit almost entirely by the candle
  // pools that follow the living explorers (see fog-of-war in buildHouse), so
  // rooms no one is near sink into shadow — you light your way as you go.
  scene.add(new THREE.AmbientLight(0x1a2742, 0.1));
  const hemi = new THREE.HemisphereLight(0x1a2238, 0x060503, 0.14);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fa2cc, 0.26);
  moon.position.set(24.5, 49, 10.5);
  // The moon is the one shadow-casting key — without this the artifact rendered
  // ZERO shadows despite shadowMap.enabled, so nothing was grounded.
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 190;
  moon.shadow.camera.left = -80;
  moon.shadow.camera.right = 80;
  moon.shadow.camera.top = 80;
  moon.shadow.camera.bottom = -80;
  scene.add(moon);

  // dust
  const N = 500;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 77;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 77 + 7;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.045, color: 0xb8a888, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  scene.add(dust);

  // wandering candle-wisps
  for (const base of [[0, 1.4, 0], [-3.5, 1.2, 10.5], [5.25, 1.6, 5.25]]) {
    const l = new THREE.PointLight(0xe8975a, 18, 17, 2);
    l.position.set(base[0], base[1], base[2]);
    l.userData.base = base;
    scene.add(l);
    wisps.push(l);
  }

  // void
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 1 }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, -FLOOR_GAP - 2, 7);
  scene.add(plane);

  houseGroup = new THREE.Group();
  tokenGroup = new THREE.Group();
  arrowGroup = new THREE.Group();
  doorGroup = new THREE.Group();
  scene.add(houseGroup, tokenGroup, arrowGroup, doorGroup);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  renderer.domElement.addEventListener("pointerdown", onClick);
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyMove);
  animate();
}

/** Arrow keys / WASD move the active human player (camera-relative); E ends the turn. */
function onKeyMove(e) {
  if (!state) return;
  // A cinematic beat (card flip / death banner) is modal: Enter/Space advances
  // it, everything else is swallowed so the board can't be acted on behind it.
  if (!Beats.idle()) {
    if (e.key === "Enter" || e.key === " ") Beats.skip();
    e.preventDefault();
    return;
  }
  if (state.phase !== "explore" && state.phase !== "haunt") return;
  // A pending haunt reveal is a blocking modal: swallow movement/end-turn keys
  // until it's dismissed, so the board can't be acted on behind the overlay.
  if (state.haunt && state.phase === "haunt" && lastHauntShown !== state.haunt.id) {
    e.preventDefault();
    return;
  }
  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (e.key === "e" || e.key === "E") {
    if (active && !active.isBot) act({ type: "end-turn", playerId: active.id });
    return;
  }
  const which = SCREEN_KEY[e.key];
  if (!which) return;
  if (!active || active.isBot) { toast("Hold on — it isn't your turn yet."); return; }
  const room = active.position ? state.house[active.position] : null;
  if (!room) return;

  // Camera-relative basis projected on the ground: "up" = away from the camera.
  let fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z;
  const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const rx = -fz, rz = fx;
  let vx, vz;
  if (which === "up") { vx = fx; vz = fz; }
  else if (which === "down") { vx = -fx; vz = -fz; }
  else if (which === "right") { vx = rx; vz = rz; }
  else { vx = -rx; vz = -rz; }
  const dir = snapGrid(vx, vz);

  const legal = DH.legalMoves(state, active.id);
  if (legal.doors.includes(dir)) { e.preventDefault(); act({ type: "explore", playerId: active.id, door: dir }); return; }
  const nKey = DH.neighborKey(room.floor, room.x, room.y, dir);
  if (legal.explored.includes(nKey)) { e.preventDefault(); act({ type: "move-to", playerId: active.id, toKey: nKey }); return; }
  // Vertical fallback: stairs and the elevator have no compass direction, so
  // "up"/"down" (away-from / toward the camera) also ascend/descend to a
  // reachable landing on another floor when no same-floor move applies.
  if (which === "up" || which === "down") {
    const RANK = { basement: 0, ground: 1, upper: 2 };
    const here = RANK[room.floor];
    const cross = legal.explored
      .map((k) => ({ k, r: RANK[DH.parseKey(k).floor] }))
      .filter((o) => (which === "up" ? o.r > here : o.r < here))
      .sort((p, q) => (which === "up" ? p.r - q.r : q.r - p.r));
    if (cross.length) { e.preventDefault(); act({ type: "move-to", playerId: active.id, toKey: cross[0].k }); return; }
  }
  e.preventDefault();
  toast(state.movementLeft <= 0 ? "No movement left — press E to end your turn." : "No way through there.");
}

function clearGroup(g) {
  for (let i = g.children.length - 1; i >= 0; i--) {
    const c = g.children[i];
    c.traverse?.((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      // CSS2DRenderer leaves a label's DOM node in the page when its object is
      // removed from the graph — pull it out by hand or labels pile up as the
      // tokens rebuild each render.
      if (o.isCSS2DObject) o.element?.remove?.();
    });
    g.remove(c);
  }
}

const WALL_MAT = () => new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });

/** Build a room's static structure (floor, walls, themed decor) once. */
function buildRoomGroup(room) {
  const def = DH.ROOMS_BY_ID[room.roomId];
  const theme = roomTheme(room.roomId);
  const g = new THREE.Group();
  const [wx, wy, wz] = roomWorld(room);
  g.position.set(wx, wy, wz);

  const surf = surfaceFor(room.roomId);
  const floorMat = surf.floor === "stone"
    ? materials.crackedStone({ tint: theme.floor })
    : materials.agedHardwood({ tint: theme.floor });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.3, TILE), floorMat);
  floor.position.y = -0.15;
  floor.receiveShadow = true;
  floor.userData = { kind: "room", key: room.key, lit: false };
  g.add(floor);

  // Each wall gets its OWN material instance (textures are cached, so this is
  // four cheap objects) — the x-ray fade writes per-mesh opacity and must never
  // leak to a sibling wall or another room sharing the material.
  const wallMatFor = () => surf.wall === "wallpaper"
    ? materials.peelingWallpaper({ tint: theme.wall })
    : surf.wall === "stone"
      ? materials.crackedStone({ tint: theme.wall })
      : materials.stainedPlaster({ tint: theme.wall });

  const doors = DH.placedDoorways(room);
  const H = TILE / 2;
  const walls = [];
  for (const d of DIRS) {
    if (doors.has(d)) continue;
    const wall = new THREE.Mesh(
      (d === "north" || d === "south") ? new THREE.BoxGeometry(TILE, WALL_H, 0.2) : new THREE.BoxGeometry(0.2, WALL_H, TILE),
      wallMatFor(),
    );
    wall.position.set(d === "east" ? H : d === "west" ? -H : 0, WALL_H / 2, d === "south" ? H : d === "north" ? -H : 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    // Tag for the per-frame x-ray pass: outward normal + precomputed world box
    // (walls are static axis-aligned boxes — nothing to recompute per frame).
    wall.userData.xray = {
      until: 0,
      roomKey: room.key,
      normal: new THREE.Vector3(d === "east" ? 1 : d === "west" ? -1 : 0, 0, d === "south" ? 1 : d === "north" ? -1 : 0),
      box: null,
    };
    walls.push(wall);
    g.add(wall);
  }

  const decorG = buildRoomDecor(room.roomId, TILE, { doors });
  g.add(decorG);

  // Decay-2.2 falloff: corner distance grew ×1.75, so ~×2.9 intensity keeps the
  // candle-pool brightness at the walls.
  const accentBase = theme.accentIntensity * 20;
  const accent = new THREE.PointLight(theme.accent, accentBase, TILE * 1.9, 2.2);
  accent.position.set(0, WALL_H * 0.55, 0);
  g.add(accent);

  const el = document.createElement("div");
  el.className = "lbl3d";
  el.textContent = (def?.name ?? "Room") + (def?.aura ? (def.aura > 0 ? " ✦" : " ☓") : "");
  const lbl = new CSS2DObject(el);
  lbl.position.set(0, WALL_H + 0.4, 0);
  g.add(lbl);

  houseGroup.add(g);
  // World boxes need the parent chain's matrices — houseGroup sits at identity,
  // so one update after attach settles every wall's box for good.
  g.updateMatrixWorld(true);
  for (const w of walls) w.userData.xray.box = new THREE.Box3().setFromObject(w);

  // Wall-height decor trim (cornice/beams/pilasters, tagged `xrayTrim` by the
  // decor package) must ghost with the room's walls, or faded walls leave
  // floating opaque bars over the characters. One proxy per material joins
  // `walls` with the union box; the zero normal makes it raycast-fade in pass
  // A AND ghost with the whole followed room in pass B, and its material dims
  // with fog-of-war in buildHouse via `userData.baseColor`.
  const trimMats = [];
  {
    const byMat = new Map();
    decorG.traverse((o) => {
      if (!o.isMesh || !o.userData.xrayTrim) return;
      const box = new THREE.Box3().setFromObject(o);
      const proxy = byMat.get(o.material);
      if (proxy) proxy.userData.xray.box.union(box);
      else {
        o.userData.xray = { until: 0, roomKey: room.key, normal: new THREE.Vector3(), box };
        byMat.set(o.material, o);
        trimMats.push(o.material);
      }
    });
    walls.push(...byMat.values());
  }
  return { group: g, floor, floorMat, labelEl: el, accent, accentBase, walls, trimMats };
}

/**
 * Fog-of-war visibility: a multi-source BFS out from every living explorer.
 * 0 = standing in the room, 1 = next door, etc. Rooms far from any explorer
 * fall into darkness; their candle-light dims toward a faint ember.
 */
function visibilityLevels() {
  const dist = new Map();
  const frontier = [];
  for (const p of state.players) {
    if (p.alive && p.position && state.house[p.position] && !dist.has(p.position)) {
      dist.set(p.position, 0); frontier.push(p.position);
    }
  }
  let d = 0, cur = frontier;
  while (cur.length && d < 6) {
    const next = [];
    for (const k of cur) for (const nb of DH.connections(state, k)) {
      if (!dist.has(nb)) { dist.set(nb, d + 1); next.push(nb); }
    }
    cur = next; d++;
  }
  return dist;
}

/** Candle brightness for a room at BFS depth `d` from the nearest explorer. */
function litFactorFor(d) {
  if (d == null) return 0.1;             // never seen / cut off — dim, not black
  if (d <= 0) return 1.0;                // you're standing in it
  if (d === 1) return 0.72;              // the next room over
  if (d === 2) return 0.42;
  if (d === 3) return 0.26;
  return 0.16;                           // a faint memory of the layout
}

/** Sync the house: build new rooms once, then refresh highlight + fog-of-war. */
function buildHouse(legal) {
  const hi = new Set(legal.explored);
  const vis = visibilityLevels();
  for (const room of Object.values(state.house)) {
    let entry = roomCache.get(room.key);
    if (!entry) {
      entry = buildRoomGroup(room);
      roomCache.set(room.key, entry);
    }
    const lit = hi.has(room.key);
    entry.floor.userData.lit = lit;
    // Fog-of-war: dim the candle and the floor for rooms far from any explorer.
    const f = litFactorFor(vis.get(room.key));
    entry.accent.intensity = entry.accentBase * f;
    // Color now multiplies the procedural map: white keeps the texture intact
    // while the emissive provides the lit highlight; otherwise tint by theme,
    // darkened by how far the room is from a living explorer's light.
    const base = new THREE.Color(roomTheme(room.roomId).floor).multiplyScalar(0.35 + 0.65 * f);
    entry.floorMat.color.copy(lit ? new THREE.Color(0xffffff).multiplyScalar(0.4 + 0.6 * f) : base);
    entry.floorMat.emissive.set(lit ? 0x5a8f5a : 0x000000);
    entry.floorMat.emissiveIntensity = lit ? 0.5 : 0;
    // The wall-height trim dims with the room (decor contract: baseColor * lit
    // curve) so unlit rooms don't show near-black bars over bright floors.
    for (const tm of entry.trimMats) tm.color.set(tm.userData.baseColor).multiplyScalar(0.35 + 0.65 * f);
    entry.labelEl.className = "lbl3d" + (lit ? " lit" : "") + (f < 0.2 ? " faint" : "");
  }
  // Doors first: a door is born in the same pass its far room lands, and its
  // stubs/header must join THIS rebuild of the registry, not the next one.
  syncDoors();
  // Keep the flat x-ray registry in step with both caches (self-heals across
  // rebuilds and new games — a size change is the only way rooms/doors appear).
  if (roomCache.size + doorCache.size !== xrayUnitCount) {
    xrayUnitCount = roomCache.size + doorCache.size;
    xrayWalls.length = 0;
    for (const e of roomCache.values()) if (e.walls) xrayWalls.push(...e.walls);
    for (const e of doorCache.values()) if (e.walls) xrayWalls.push(...e.walls);
  }
}

// ---- doors ----------------------------------------------------------------
// A door is built once at each *real* passage — a boundary where two placed
// rooms each have a matching doorway. A doorway that still opens onto the
// unknown stays a bare gap (marked by the flame arrow) until it's explored;
// the door springs into being the moment the new room is placed beyond it.
const DOOR_MAX_SWING = Math.PI * 0.56;

function buildDoorEntry(pos, rotated) {
  const g = new THREE.Group();
  g.position.copy(pos);
  if (rotated) g.rotation.y = Math.PI / 2; // east/west boundary: opening runs along z

  const H = TILE / 2;
  const DW = 2.4; // door opening width — human-scale absolute (the rest of the wall is stub)
  const DHt = 2.6; // door height — grand but human, leaving a real header under the wall top
  const WT = 0.22; // wall/door-wall thickness
  const LT = 0.12; // leaf thickness
  // One material PER stub/header mesh — they join the x-ray pass, whose fade
  // writes per-mesh opacity and must never leak to a sibling segment.
  const wallMatFor = () => new THREE.MeshStandardMaterial({ color: 0x241b14, roughness: 1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c2016, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a3422, roughness: 0.82, metalness: 0.04 });

  // Stubs of dividing wall either side of the opening, and a header above it, so
  // the boundary reads as a solid wall with a doorway cut into it. The chase cam
  // puts this boundary square between camera and hero at every room crossing,
  // so all three ghost like room walls do (the leaf and jambs never fade).
  const xwalls = [];
  const stubW = H - DW / 2;
  for (const sx of [-1, 1]) {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(stubW, WALL_H, WT), wallMatFor());
    stub.position.set(sx * (DW / 2 + stubW / 2), WALL_H / 2, 0);
    stub.castShadow = true; stub.receiveShadow = true;
    xwalls.push(stub);
    g.add(stub);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(DW, WALL_H - DHt, WT), wallMatFor());
  header.position.set(0, (DHt + WALL_H) / 2, 0);
  header.castShadow = true; header.receiveShadow = true;
  xwalls.push(header);
  g.add(header);

  // jambs frame the opening
  const postGeo = new THREE.BoxGeometry(0.1, DHt + 0.06, WT + 0.06);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(sx * (DW / 2), DHt / 2, 0);
    post.castShadow = true;
    g.add(post);
  }

  // the hinged leaf: a pivot at the left jamb, leaf extending across the opening
  const pivot = new THREE.Group();
  pivot.position.set(-(DW / 2) + 0.02, 0, 0);
  const leafW = DW - 0.05;
  const leafH = DHt - 0.05;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, LT), leafMat);
  leaf.position.set(leafW / 2, leafH / 2, 0);
  leaf.castShadow = true; leaf.receiveShadow = true;
  pivot.add(leaf);
  // two recessed panels for a little relief
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.9 });
  for (const py of [leafH * 0.28, leafH * 0.68]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.6, leafH * 0.26, 0.03), panelMat);
    panel.position.set(leafW / 2, py, LT / 2);
    pivot.add(panel);
  }
  // brass knob near the free edge
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xc8a23a, metalness: 0.75, roughness: 0.3 }),
  );
  knob.position.set(leafW - 0.18, leafH * 0.5, LT / 2 + 0.03);
  pivot.add(knob);

  g.add(pivot);
  doorGroup.add(g);
  // World boxes need the group's final placement — same pattern as
  // buildRoomGroup: one matrix update after attach settles them for good.
  g.updateMatrixWorld(true);
  for (const w of xwalls) {
    w.userData.xray = { until: 0, roomKey: "", normal: new THREE.Vector3(), box: new THREE.Box3().setFromObject(w) };
  }
  return { group: g, pivot, open: 0, openTarget: 0, closeAt: 0, walls: xwalls };
}

/** Create any missing doors at boundaries that have become real passages. */
function syncDoors() {
  const H = TILE / 2;
  for (const room of Object.values(state.house)) {
    const doors = DH.placedDoorways(room);
    for (const d of DIRS) {
      if (!doors.has(d)) continue;
      const nKey = DH.neighborKey(room.floor, room.x, room.y, d);
      const neighbor = state.house[nKey];
      if (!neighbor) continue; // still opens onto the unknown — leave the gap + arrow
      if (!DH.placedDoorways(neighbor).has(DH.opposite(d))) continue; // walls don't meet: no passage
      const bid = DH.barricadeId(room.key, nKey);
      if (doorCache.has(bid)) continue;
      const { dx, dy } = DH.DIR_DELTA[d];
      const pos = new THREE.Vector3(room.x * TILE + dx * H, FLOOR_Y[room.floor], room.y * TILE + dy * H);
      doorCache.set(bid, buildDoorEntry(pos, d === "east" || d === "west"));
    }
  }
}

/** Swing the door between two rooms open (auto-closes shortly after). */
function openDoorBetween(aKey, bKey) {
  const e = doorCache.get(DH.barricadeId(aKey, bKey));
  if (e) { e.openTarget = 1; e.closeAt = performance.now() + 1500; Sound.door(); }
}

function makePlayerToken(p) {
  const char = p.characterId ? DH.CHARACTERS_BY_ID[p.characterId] : null;
  const g = new THREE.Group();
  const fig = buildExplorerFigure(char?.color ?? "#aaaaaa", { archetype: p.characterId });
  if (attachAvatar(g, p.characterId, 1.6, tokenAvatarMixers)) {
    fig.visible = false; // real model takes over; keep fig hidden for cheap cleanup
  }
  g.add(fig);

  const beamLight = new THREE.PointLight(0xe8a85a, 5, 6, 2);
  beamLight.position.y = 1.6;
  beamLight.visible = false;
  g.add(beamLight);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.55, 3.8, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe8a85a, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  beam.position.y = 1.9;
  beam.visible = false;
  g.add(beam);
  const traitorLight = new THREE.PointLight(0xc2412f, 4, 4, 2);
  traitorLight.position.y = 1;
  traitorLight.visible = false;
  g.add(traitorLight);

  const el = document.createElement("div");
  el.className = "tok-lbl";
  const lbl = new CSS2DObject(el);
  lbl.position.set(0, 1.9, 0);
  g.add(lbl);

  tokenGroup.add(g);
  return { kind: "p", group: g, fig, el, beam, beamLight, traitorLight, target: new THREE.Vector3(), yaw: 0, baseY: 0.02, phase: Math.random() * 6, active: false, placed: false };
}

function makeMonsterToken(m) {
  const g = new THREE.Group();
  const fig = buildMonsterFigure(m.name);
  g.add(fig);
  const light = new THREE.PointLight(0xc2412f, 2.5, 5, 2);
  g.add(light);
  const el = document.createElement("div");
  el.className = "tok-lbl monster";
  const lbl = new CSS2DObject(el);
  lbl.position.set(0, 1.9, 0);
  g.add(lbl);
  tokenGroup.add(g);
  return { kind: "m", group: g, fig, el, light, target: new THREE.Vector3(), yaw: 0, baseY: 0.05, phase: 0, active: false, placed: false };
}

function disposeToken(tok) {
  tok.group.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
    if (o.isCSS2DObject) o.element?.remove?.();
  });
  tokenGroup.remove(tok.group);
}

/** Float "−1 Knowledge" above a character's head — a transient CSS2D label that
 *  rises and fades (~1.8s), then leaves the scene. The inner span carries the
 *  animation because CSS2DRenderer owns the outer element's transform. */
function spawnStatFloat(playerId, trait, d) {
  const tok = tokenCache.get(playerId);
  if (!tok) return;
  const el = document.createElement("div");
  el.className = "stat-float";
  el.style.color = TRAIT_COLOR[trait];
  const span = document.createElement("span");
  span.textContent = `${d > 0 ? "+" : "−"}${Math.abs(d)} ${trait.charAt(0).toUpperCase()}${trait.slice(1)}`;
  el.appendChild(span);
  const lbl = new CSS2DObject(el);
  // Simultaneous hits (−1 Might and −1 Speed in one action) stack upward.
  tok.statFloats = (tok.statFloats ?? 0) + 1;
  lbl.position.set(0, 2.25 + 0.35 * (tok.statFloats - 1), 0);
  tok.group.add(lbl);
  setTimeout(() => { tok.group.remove(lbl); el.remove(); tok.statFloats--; }, 1900);
}

// ---- waypoint walking (Feature 1) -----------------------------------------
// Characters walk the room's annulus and pass through doors instead of gliding
// straight through the island centerpiece. Paths are planned once per move
// (allocations here are fine); the frame loop only consumes them.
const _walkV = new THREE.Vector3(); // scratch for the per-frame walker

/** Does the ground segment a→b pass within `r` of the point (cx,cz)? */
function segNearCenter(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  const t = L2 ? Math.min(1, Math.max(0, ((cx - ax) * dx + (cz - az) * dz) / L2)) : 0;
  const px = ax + dx * t - cx, pz = az + dz * t - cz;
  return px * px + pz * pz < r * r;
}

/** Append intermediate ring waypoints from angle a0 to a1 around (cx,cz), the
 *  SHORT way, one point per 60° of arc — a 60° chord of r=1.6 stays 1.39 from
 *  the centre, safely outside the ISLAND_R=1.2 centerpiece. The endpoint at a1
 *  is NOT pushed (callers land on their exact destination themselves). */
function pushArc(path, cx, cy, cz, a0, a1) {
  let d = a1 - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const steps = Math.ceil(Math.abs(d) / (Math.PI / 3));
  for (let i = 1; i < steps; i++) {
    const a = a0 + (d * i) / steps;
    path.push(new THREE.Vector3(cx + Math.cos(a) * WALK_R, cy, cz + Math.sin(a) * WALK_R));
  }
}

/** Plan how `tok` walks to its (just-changed) `tok.target` in room `toKey`.
 *  Adjacent same-floor hops walk the old room's ring to the shared door, cross
 *  at the door midpoint, and take the new ring the short way to the slot; an
 *  in-room re-shuffle goes straight unless the line would clip the island,
 *  then it arcs. Floor changes and non-adjacent jumps keep the direct glide
 *  (path = null). A token still mid-walk gets the new legs appended so the
 *  journey stays continuous — unless the backlog outgrows ~3 rooms of walking,
 *  when it snaps back to the glide to catch up. */
function planTokenPath(tok, toKey) {
  const from = tok.lastKey ? state.house[tok.lastKey] : null;
  const to = state.house[toKey];
  const hop = from && to && from.floor === to.floor ? Math.abs(to.x - from.x) + Math.abs(to.y - from.y) : 99;
  if (!from || !to || hop > 1) { tok.path = null; return; }
  const cont = !!(tok.path && tok.path.length); // mid-walk: extend, don't restart
  const path = cont ? tok.path : [];
  const start = cont ? path[path.length - 1] : tok.group.position;
  if (hop === 1) {
    const [ax, ay, az] = roomWorld(from);
    const [bx, by, bz] = roomWorld(to);
    const doorA = Math.atan2(bz - az, bx - ax); // old-room ring angle facing the shared door
    const ex = ax + Math.cos(doorA) * WALK_R, ez = az + Math.sin(doorA) * WALK_R;
    // Reaching the exit point is itself an in-room leg: arc around if the
    // straight line from the current slot would cut across the old island.
    if (segNearCenter(start.x, start.z, ex, ez, ax, az, ISLAND_R)) {
      pushArc(path, ax, ay, az, Math.atan2(start.z - az, start.x - ax), doorA);
    }
    path.push(new THREE.Vector3(ex, ay, ez));
    path.push(new THREE.Vector3((ax + bx) / 2, by, (az + bz) / 2)); // door midpoint
    const doorB = Math.atan2(az - bz, ax - bx); // new-room ring angle facing back at the door
    path.push(new THREE.Vector3(bx + Math.cos(doorB) * WALK_R, by, bz + Math.sin(doorB) * WALK_R));
    pushArc(path, bx, by, bz, doorB, Math.atan2(tok.target.z - bz, tok.target.x - bx));
  } else {
    // Same room, new slot: straight, unless that would cut across the island.
    const [cx, cy, cz] = roomWorld(to);
    if (segNearCenter(start.x, start.z, tok.target.x, tok.target.z, cx, cz, ISLAND_R)) {
      pushArc(path, cx, cy, cz, Math.atan2(start.z - cz, start.x - cx), Math.atan2(tok.target.z - cz, tok.target.x - cx));
    }
  }
  path.push(tok.target.clone());
  tok.path = path;
  let rem = 0, px = tok.group.position.x, pz = tok.group.position.z;
  for (const w of path) { rem += Math.hypot(w.x - px, w.z - pz); px = w.x; pz = w.z; }
  if (rem > TILE * 3) tok.path = null;
}

/** Retarget a token; when the destination genuinely moved, plan the walk. */
function setTokenDest(tok, x, y, z, key) {
  const moved = tok.placed && (tok.target.x !== x || tok.target.y !== y || tok.target.z !== z);
  tok.target.set(x, y, z);
  if (moved) planTokenPath(tok, key);
}

// Reconcile the persistent token set against the current state: create new
// tokens, retire vanished ones, and update each token's TARGET (the animate
// loop eases the actual position toward it, so movement reads as travel).
function syncTokens(legal) {
  const byKey = {};
  // The dead stay where the house took them — a fallen body in the room reads
  // the story back to everyone who walks past it.
  for (const p of state.players) if (p.position) (byKey[p.position] ??= []).push({ kind: "p", id: p.id, p });
  for (const m of state.haunt?.monsters ?? []) if (m.hp > 0 && m.position) (byKey[m.position] ??= []).push({ kind: "m", id: m.id, m });

  const attackable = new Set(legal.attackMonsters);
  const seen = new Set();
  for (const key in byKey) {
    const occ = byKey[key];
    const room = state.house[key];
    if (!room) continue;
    const [wx, wy, wz] = roomWorld(room);
    occ.forEach((o, i) => {
      const [ox, oz] = ring(i, occ.length, WALK_R);
      seen.add(o.id);
      let tok = tokenCache.get(o.id);
      if (o.kind === "p") {
        if (!tok) { tok = makePlayerToken(o.p); tokenCache.set(o.id, tok); }
        setTokenDest(tok, wx + ox, wy, wz + oz, key);
        const dead = !o.p.alive;
        if (dead && !tok.dead) {
          // First frame of death: the body falls where it stood and stays.
          tok.dead = true;
          setAvatarClip(tok.group, "death", 0.3);
          if (tok.fig.visible) { tok.fig.rotation.x = -Math.PI / 2; tok.fig.position.y = 0.12; }
        }
        tok.active = !dead && state.activePlayerId === o.p.id;
        tok.beam.visible = tok.active;
        tok.beamLight.visible = tok.active;
        const traitor = o.p.side === "traitor";
        tok.traitorLight.visible = traitor && !dead;
        tok.el.className = "tok-lbl" + (traitor ? " traitor" : "") + (dead ? " dead" : "");
        tok.el.textContent = dead ? "✝ " + o.p.name : o.p.name + (traitor ? " ☠" : "");
      } else {
        if (!tok) { tok = makeMonsterToken(o.m); tokenCache.set(o.id, tok); }
        setTokenDest(tok, wx + ox, wy, wz + oz, key);
        const atk = attackable.has(o.m.id);
        tok.light.intensity = atk ? 5 : 2.5;
        tok.el.className = "tok-lbl monster";
        tok.el.textContent = `${o.m.name}${o.m.attackType === "mental" ? " ✦" : ""} · ${o.m.hp}♥${atk ? " — strike" : ""}`;
        tok.fig.traverse((x) => { x.userData.kind = "monster"; x.userData.monsterId = o.m.id; x.userData.attackable = atk; });
      }
      // Crossing a boundary swings that door open as the figure passes through.
      if (tok.lastKey && tok.lastKey !== key) openDoorBetween(tok.lastKey, key);
      tok.lastKey = key;
    });
  }
  for (const [id, tok] of tokenCache) {
    if (!seen.has(id)) { disposeToken(tok); tokenCache.delete(id); }
  }
}

function buildArrows(legal) {
  clearGroup(arrowGroup);
  const me = state.players.find((p) => p.id === state.activePlayerId);
  const room = me?.position ? state.house[me.position] : null;
  if (!room) return;
  const [wx, wy, wz] = roomWorld(room);
  const H = TILE / 2;
  for (const dir of legal.doors) {
    const { dx, dy } = DH.DIR_DELTA[dir];
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.95, 4),
      new THREE.MeshStandardMaterial({ color: 0xe8a85a, emissive: 0xe8a85a, emissiveIntensity: 1.2 }),
    );
    cone.position.set(wx + dx * (H + 0.4), wy + 1.0, wz + dy * (H + 0.4));
    cone.rotation.set(
      dir === "north" ? -Math.PI / 2 : dir === "south" ? Math.PI / 2 : 0,
      0,
      dir === "east" ? -Math.PI / 2 : dir === "west" ? Math.PI / 2 : 0,
    );
    cone.userData = { kind: "door", dir };
    arrowGroup.add(cone);
    const pl = new THREE.PointLight(0xe8a85a, 4, 3.5, 2);
    pl.position.copy(cone.position);
    arrowGroup.add(pl);
  }
}

// =========================================================================
// INPUT
// =========================================================================
function onClick(e) {
  if (!state || state.phase === "ended") return;
  if (!Beats.idle()) return; // a modal beat owns the screen (clicks land on it)
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([houseGroup, tokenGroup, arrowGroup], true);
  const me = state.activePlayerId;
  for (const h of hits) {
    // A ghosted wall can't swallow a floor click the player plainly sees through.
    if (h.object.userData.xray && h.object.material.opacity < 0.5) continue;
    let o = h.object;
    while (o && !o.userData?.kind) o = o.parent;
    if (!o) continue;
    const ud = o.userData;
    if (ud.kind === "room" && ud.lit) return act({ type: "move-to", playerId: me, toKey: ud.key });
    if (ud.kind === "door") return act({ type: "explore", playerId: me, door: ud.dir });
    if (ud.kind === "monster" && ud.attackable) return act({ type: "attack", playerId: me, targetMonsterId: ud.monsterId });
  }
}

function act(action) {
  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (active && active.isBot) return; // bots are driven automatically
  dispatch(action);
  render();
  driveBots();
}

/** Surface the latest thing the active bot did as an on-screen cue, so a human
 *  can follow the other players' turns by watching rather than reading the log.
 *  Entries already staged as cinematic beats don't need the subtitle too. */
function announceBot(fromLogLen) {
  const fresh = state.log.slice(fromLogLen).filter((e) => !Beats.consumed.has(e.id));
  if (fresh.length) toast(fresh[0].text);
}

/** Local bot driver: step the active bot on a timer, then hand back to humans.
 *  Paced so a human can watch each move; a new bot's first beat is longer. */
function driveBots() {
  if (botTimer) return;
  if (!state || (state.phase !== "explore" && state.phase !== "haunt")) return;
  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (!active || !active.isBot) { lastBotId = null; return; }
  const newTurn = active.id !== lastBotId;
  lastBotId = active.id;
  botTimer = setTimeout(function step() {
    botTimer = null;
    // A cinematic beat (card flip / death banner) owns the screen: hold this
    // bot's step until it dismisses, so the presentation never falls behind
    // the live game — the reveal must describe the move happening NOW.
    if (!Beats.idle()) { botTimer = setTimeout(step, 300); return; }
    const a = state.players.find((p) => p.id === state.activePlayerId);
    if (!a || !a.isBot || (state.phase !== "explore" && state.phase !== "haunt")) {
      render();
      return;
    }
    const before = { pos: a.position, move: state.movementLeft };
    const logLen = state.log.length;
    // NOT named `step`: that would shadow the function expression above and
    // put the beat-hold retry's `setTimeout(step, …)` in its temporal dead zone.
    const bot = DH.botStep(state, a.id);
    dispatch(bot.action);
    const stalled =
      !bot.endTurnAfter &&
      bot.action.type !== "end-turn" &&
      a.position === before.pos &&
      state.movementLeft === before.move;
    if ((bot.endTurnAfter && bot.action.type !== "end-turn") || stalled) {
      if (state.activePlayerId === a.id) dispatch({ type: "end-turn", playerId: a.id });
    }
    announceBot(logLen);
    render();
    driveBots();
  }, newTurn ? BOT_TURN_START_MS : BOT_STEP_MS);
}

// =========================================================================
// RENDER (state -> scene + HUD)
// =========================================================================
function render() {
  // Tint the whole scene with dread once the house has turned.
  document.body.classList.toggle("haunting", state.phase === "haunt");
  const me = state.activePlayerId;
  const legal = me ? DH.legalMoves(state, me) : { explored: [], doors: [], attackMonsters: [], attackPlayers: [], pickupItems: [], tradePartners: [] };
  buildHouse(legal);
  syncTokens(legal);
  buildArrows(legal);
  updateHUD(legal);
}

function tagIcon(cardId) {
  const c = DH.getCard(cardId);
  if (!c) return "•";
  if (c.type === "omen") return "☠";
  if (c.effect.kind === "consumable") return "🧪";
  if (c.effect.kind === "item-passive") {
    return { weapon: "⚔", armor: "🛡", key: "🗝", light: "🔦", holy: "✝", occult: "👁" }[c.effect.tag] ?? "•";
  }
  return "•";
}

/** Plain-language notes on what a room does, so a player knows what they walked
 *  into — its standing aura and any one-time effect on discovery. */
const ROOM_SPECIAL_NOTE = {
  "heal-might": "Steadies your nerve — +1 Might the first time it's found.",
  "heal-sanity": "A small mercy — +1 Sanity the first time it's found.",
  "drain-speed": "The air drags like syrup — −1 Speed the first time it's found.",
  pit: "A hidden drop in the dark — −1 Might the first time it's found.",
  vault: "A sealed vault — loot it if you carry the Iron Key.",
  "draw-extra-omen": "It pulls the dark closer — draws an extra Omen.",
  "mystic-elevator": "An iron cage that carries you between floors.",
  "grand-staircase": "Stairs up and down — change floors here.",
  "stairs-up": "Stairs up — change floors here.",
  "stairs-down": "Stairs down — change floors here.",
  "entrance-hall": "The front door — in some haunts you escape through here.",
};
function roomNotes(def) {
  const notes = [];
  if (def.aura > 0) notes.push(`✦ Blessed — +${def.aura} die to every roll while you're here.`);
  else if (def.aura < 0) notes.push(`☓ Cursed — ${def.aura} dice to every roll while you're here.`);
  if (ROOM_SPECIAL_NOTE[def.special]) notes.push(ROOM_SPECIAL_NOTE[def.special]);
  if ((def.symbols || []).length) {
    const kinds = [...new Set(def.symbols)].map((k) => ({ event: "an Event", item: "an Item", omen: "an Omen" }[k] || k));
    notes.push(`On discovery it reveals ${kinds.join(" & ")}.`);
  }
  return notes;
}

function updateHUD(legal) {
  const active = state.players.find((p) => p.id === state.activePlayerId);
  const humans = state.players.filter((p) => !p.isBot);
  // Solo: always show the (single) human. Hotseat: whoever's turn it is.
  const me = humans.length === 1 ? humans[0] : active;
  const ended = state.phase === "ended";
  const haunt = state.phase === "haunt" || ended;
  const botActing = !!active && active.isBot && !ended;

  // Reactive heartbeat: thuds while the explorer you're watching is near death
  // (any trait one step from the skull). Falls silent once they're safe or gone.
  const peril = !ended && me && me.alive && me.characterId &&
    DH.TRAITS.some((t) => (me.traitIndex[t] ?? 9) <= 1);
  Sound.setHeart(!!peril);

  const activeChar = active?.characterId ? DH.CHARACTERS_BY_ID[active.characterId] : null;
  const turnChip = activeChar
    ? `<span class="turn-chip"><span class="roster-avatar" style="--pc:${activeChar.color}">${activeChar.name.charAt(0)}</span> ${active.name}</span>`
    : `<span class="turn-chip">${active?.name ?? "…"}</span>`;
  // Movement as lit boot pips instead of a raw number (first 8; overflow as +N).
  const spd = activeChar ? activeChar.traits.speed.values[active.traitIndex.speed] : 0;
  const pipTotal = Math.min(8, Math.max(spd, state.movementLeft));
  const pipLit = Math.min(state.movementLeft, 8);
  let pips = "";
  for (let i = 0; i < pipTotal; i++) pips += `<span class="mp${i < pipLit ? "" : " spent"}">${TRAIT_ICON.speed}</span>`;
  if (state.movementLeft > 8) pips += `<span class="mp-more">+${state.movementLeft - 8}</span>`;
  $("hud-top").innerHTML =
    `<div class="hud-turn">${state.phase === "haunt" ? '<span class="haunt-tag">THE HAUNT · </span>' : ""}` +
    `${ended ? '<span class="haunt-tag">CONCLUDED · </span>' : ""}` +
    `<span class="round-chip">Round ${state.turn}</span>${turnChip}` +
    `${!ended ? (botActing ? ' <span class="muted">is taking their turn…</span>' : ' <span class="you-tag"> — your move</span>') : ""}</div>` +
    `${!ended ? `<div class="hud-move" title="Movement left: ${state.movementLeft}">${pips}</div>` : ""}`;

  // party chips — position lives in the 3D view now, not as text. Every
  // player's four traits stay visible (icon + value); a fresh change pulses
  // the value and floats a ±N badge. Both animate off recentDeltas timestamps
  // (negative animation-delay) so they survive the post-dispatch rebuild.
  const nowP = performance.now();
  const roster = state.players.map((p) => {
    const c = p.characterId ? DH.CHARACTERS_BY_ID[p.characterId] : null;
    const isMe = humans.length === 1 && p.id === humans[0].id;
    const traits = c
      ? `<span class="roster-traits">` + DH.TRAITS.map((t) => {
          const val = c.traits[t].values[p.traitIndex[t] ?? 0];
          const rd = latestDelta(p.id, t, nowP);
          const age = rd ? nowP - rd.at : 0;
          const pulse = rd && age < TRAIT_PULSE_MS ? (rd.d > 0 ? " trait-pulse-up" : " trait-pulse-down") : "";
          const badge = rd
            ? `<span class="trait-delta ${rd.d > 0 ? "up" : "down"}">${rd.d > 0 ? "+" : "−"}${Math.abs(rd.d)}<span class="td-ico">${TRAIT_ICON[t]}</span></span>`
            : "";
          return `<span class="roster-trait${pulse}" style="--tc:${TRAIT_COLOR[t]};--dly:-${age.toFixed(0)}ms" title="${t} ${val}">` +
            `<span class="rt-ico">${TRAIT_ICON[t]}</span><span class="rt-val">${val}</span>${badge}</span>`;
        }).join("") + `</span>`
      : "";
    return `<div class="roster-row${state.activePlayerId === p.id ? " active" : ""}${!p.alive ? " dead" : ""}">` +
      `<span class="roster-avatar" style="--pc:${c?.color ?? "#888"}">${p.alive ? (c?.name.charAt(0) ?? "?") : "☠"}</span>` +
      `<span class="roster-name">${p.name}${isMe ? " (you)" : ""}</span>` +
      traits +
      `${p.side === "traitor" ? '<span class="roster-traitor">☠</span>' : ""}</div>`;
  }).join("");
  // Chronicle: a compact icon-led toast feed by default (recent entries fade to
  // 40% after 8s via the --age animation-delay trick, surviving innerHTML
  // rebuilds), expandable to the full scrolling panel.
  const nowT = Date.now();
  const log = state.log.slice(logOpen ? -60 : -5).map((e) => {
    if (!logSeen.has(e.id)) logSeen.set(e.id, nowT);
    const dice = e.dice?.length ? ` <span class="dice">${e.dice.map((v) => `<i class="die d${v}">${v}</i>`).join("")}</span>` : "";
    return `<div class="log-entry k-${e.kind}" style="--age:-${nowT - logSeen.get(e.id)}ms">` +
      `<span class="li">${LOG_ICON[e.kind] ?? "✧"}</span><span class="log-text">${e.text}</span>${dice}</div>`;
  }).join("");
  $("hud-left").innerHTML =
    `<div class="panel roster party-roster">${roster}</div>` +
    `<div class="event-log${logOpen ? " open" : ""}">` +
    `<div class="log-head">${logOpen ? '<span class="log-title">Chronicle</span>' : ""}` +
    `<button class="log-toggle" title="Chronicle" onclick="window.__logToggle()">${logOpen ? "✕" : "📜"}</button></div>` +
    `<div class="log-scroll" id="log-scroll">${log}</div></div>`;
  if (logOpen) { const ls = $("log-scroll"); if (ls) ls.scrollTop = ls.scrollHeight; }

  // trait panel for the active player
  if (me && me.characterId) {
    const c = DH.CHARACTERS_BY_ID[me.characterId];
    const goal = state.haunt && me.side ? (me.side === "traitor" ? state.haunt.traitorGoal : state.haunt.heroGoal) : null;
    // "Current room" card: what you walked into and what it does, like a tile.
    const _room = me.position ? state.house[me.position] : null;
    const _rdef = _room ? DH.ROOMS_BY_ID[_room.roomId] : null;
    const _notes = _rdef ? roomNotes(_rdef) : [];
    const roomCard = _rdef
      ? `<div class="panel room-info">` +
        `<div class="ri-head"><span class="ri-name">${_rdef.name}</span>` +
        (_rdef.aura ? `<span class="ri-aura ${_rdef.aura > 0 ? "good" : "bad"}">${_rdef.aura > 0 ? "✦ blessed" : "☓ cursed"}</span>` : "") +
        `</div>` +
        `<div class="ri-flavor muted small">${_rdef.flavor}</div>` +
        (_notes.length ? `<ul class="ri-notes">${_notes.map((n) => `<li>${n}</li>`).join("")}</ul>` : "") +
        `</div>`
      : "";
    $("hud-right").innerHTML =
      roomCard +
      `<div class="panel trait-panel ${!me.alive ? "dead" : ""}">` +
      `<div class="tp-head" style="border-color:${c.color}"><div class="tp-avatar" style="--pc:${c.color}">${c.name.charAt(0)}</div>` +
      `<div><strong>${c.name}</strong><div class="muted small">${c.title}</div></div>` +
      `${me.side ? `<span class="side-tag ${me.side}">${me.side === "traitor" ? "TRAITOR" : "HERO"}</span>` : ""}</div>` +
      (!me.alive ? `<div class="tp-dead">Lost to the house.</div>` : "") +
      // Iconographic gauges: winged boot / fist / eye-candle / book, a value
      // medallion, and a notched track ending at the skull. Fresh innerHTML
      // nodes restart the flash animation exactly once per change.
      `<div class="tp-traits">` + DH.TRAITS.map((t) => {
        const tr = c.traits[t]; const idx = me.traitIndex[t];
        const k = me.id + ":" + t, was = prevTraitIdx[k]; prevTraitIdx[k] = idx;
        const flash = was === undefined || was === idx ? "" : idx > was ? " flash-up" : " flash-down";
        const notches = tr.values.map((v, i) =>
          i === 0 ? `<span class="notch skull" title="death">☠</span>`
            : `<span class="notch${i < idx ? " on" : i === idx ? " cur" : ""}" title="${v}"></span>`,
        ).join("");
        return `<div class="tp-trait${idx <= 1 ? " peril" : ""}${flash}" style="--tc:${TRAIT_COLOR[t]}" title="${t} ${tr.values[idx]}">` +
          `<span class="g-ico">${TRAIT_ICON[t]}</span>` +
          `<span class="g-val">${tr.values[idx]}</span>` +
          `<div class="g-track">${notches}</div></div>`;
      }).join("") + `</div>` +
      `<div class="tp-inv"><div class="muted small">Carrying</div>` +
      (me.inventory.length ? `<ul>${me.inventory.map((id) => {
        const mine = active && active.id === me.id && me.alive;
        const useBtn = mine && DH.getCard(id)?.effect.kind === "consumable"
          ? `<button class="ibtn" onclick="window.__act({type:'use-item',playerId:'${me.id}',cardId:'${id}'})">use</button>` : "";
        // Hand an item to a co-located explorer (the engine + React client both
        // support trades; the standalone build had no give affordance before).
        const gives = mine ? (legal.tradePartners ?? []).map((pid) => {
          const pn = (state.players.find((p) => p.id === pid)?.name ?? "ally").split(" ")[0];
          return `<button class="ibtn" onclick="window.__act({type:'give-item',playerId:'${me.id}',toPlayerId:'${pid}',cardId:'${id}'})">→ ${pn}</button>`;
        }).join("") : "";
        const card = DH.getCard(id);
        const desc = card?.text ? `<div class="inv-desc muted small">${card.text}</div>` : "";
        return `<li class="inv-li"><div class="inv-row"><span class="ii">${tagIcon(id)}</span>` +
          `<span class="inv-name">${card?.name ?? id}</span>${useBtn}${gives}</div>${desc}</li>`;
      }).join("")}</ul>` : `<div class="muted small">nothing</div>`) + `</div>` +
      (goal ? `<div class="tp-goal ${me.side}"><div class="muted small">Goal</div>${goal}</div>` : "") +
      `</div>`;
  } else {
    $("hud-right").innerHTML = "";
  }

  // bottom controls — icon-led, only on a human's turn
  let bottom = "";
  if (!ended && active && !active.isBot) {
    for (const cardId of legal.pickupItems ?? []) {
      bottom += `<button class="btn" onclick="window.__act({type:'pickup-item',playerId:'${active.id}',cardId:'${cardId}'})"><span class="bi">${tagIcon(cardId)}</span><span>Take ${DH.getCard(cardId)?.name ?? "item"}</span></button>`;
    }
    for (const id of legal.attackPlayers) {
      const name = state.players.find((p) => p.id === id)?.name ?? "foe";
      bottom += `<button class="btn danger" onclick="window.__act({type:'attack',playerId:'${active.id}',targetPlayerId:'${id}'})"><span class="bi">⚔</span><span>Attack ${name}</span></button>`;
    }
    // Deliberate actions — each spends a step, so they trade off against moving.
    if (legal.canSearch) {
      bottom += `<button class="btn act" title="Rummage this room for an item — but you might disturb something (costs 1 step)" onclick="window.__act({type:'search',playerId:'${active.id}'})"><span class="bi">🔍</span><span>Search</span></button>`;
    }
    if (legal.canInvestigate) {
      bottom += `<button class="btn act" title="A Knowledge check to read the danger ahead (costs 1 step)" onclick="window.__act({type:'investigate',playerId:'${active.id}'})"><span class="bi">👁</span><span>Investigate</span></button>`;
    }
    if (legal.canRest) {
      bottom += `<button class="btn act" title="Catch your breath to recover your most-wounded trait — ends your movement" onclick="window.__act({type:'rest',playerId:'${active.id}'})"><span class="bi">✚</span><span>Steady</span></button>`;
    }
    const _broom = active.position ? state.house[active.position] : null;
    for (const dir of legal.barricadeDoors ?? []) {
      let label = dir;
      if (_broom) {
        const nKey = DH.neighborKey(_broom.floor, _broom.x, _broom.y, dir);
        const nDef = state.house[nKey] ? DH.ROOMS_BY_ID[state.house[nKey].roomId] : null;
        if (nDef) label = nDef.name;
      }
      bottom += `<button class="btn act" title="Wedge this door shut so nothing follows for a few rounds (costs 1 step)" onclick="window.__act({type:'barricade',playerId:'${active.id}',door:'${dir}'})"><span class="bi">⛓</span><span>Barricade → ${label}</span></button>`;
    }
    bottom += `<button class="btn primary" onclick="window.__act({type:'end-turn',playerId:'${active.id}'})"><span class="bi">🕯</span><span>End turn</span>${humans.length > 1 ? ' <span class="small muted">pass device</span>' : ""}</button>`;
  }
  $("hud-bottom").innerHTML = bottom;

  // overlays — the haunt reveal waits behind any queued cinematic beats (the
  // omen card that triggered it flips first, then the house turns).
  const ov = $("overlay");
  if (haunt && state.haunt && state.phase === "haunt" && lastHauntShown !== state.haunt.id && Beats.idle()) {
    if (lastStinger !== state.haunt.id) { Sound.stinger(); lastStinger = state.haunt.id; }
    const amT = me?.side === "traitor";
    const noTraitor = state.haunt.traitorIds.length === 0;
    const tnames = state.haunt.traitorIds.map((id) => state.players.find((p) => p.id === id)?.name ?? "someone").join(", ");
    const whoLine = noTraitor
      ? '<strong class="tt">The house itself rises against you all.</strong>'
      : amT
        ? '<strong class="tt">You are the traitor.</strong>'
        : `The traitor is <strong class="tt">${tnames}</strong>.`;
    const goalsBlock = noTraitor
      ? `<div class="hgoals"><div class="ga"><span class="muted small">Everyone</span>${state.haunt.heroGoal}</div></div>`
      : `<div class="hgoals"><div class="${amT ? "ga" : ""}"><span class="muted small">Traitor</span>${state.haunt.traitorGoal}</div>` +
        `<div class="${!amT ? "ga" : ""}"><span class="muted small">Heroes</span>${state.haunt.heroGoal}</div></div>`;
    ov.style.display = "grid";
    ov.innerHTML =
      `<div class="haunt-card"><div class="kick">The house turns…</div><h2>${state.haunt.name}</h2>` +
      `<p>${whoLine}</p>` +
      goalsBlock +
      `<button class="btn primary" onclick="window.__dismiss()">${amT ? "Begin the betrayal" : "Survive"}</button></div>`;
  } else if (ended && inCampaign && Beats.idle()) {
    // A campaign chapter ends into the legacy screen, not the plain result card.
    ov.style.display = "none";
    ov.innerHTML = "";
    showLegacyEnd();
  } else if (ended && Beats.idle()) {
    ov.style.display = "grid";
    ov.innerHTML = `<div class="result"><div class="rtitle">${state.winner === "heroes" ? "The Heroes Survive" : (state.haunt && state.haunt.traitorIds.length === 0 ? "The House Prevails" : "The Traitor Triumphs")}</div>` +
      `<div class="muted">${state.haunt?.name ?? ""}</div><button class="btn" onclick="location.reload()">Play again</button></div>`;
  } else {
    ov.style.display = "none";
    ov.innerHTML = "";
  }
}

window.__act = act;
window.__dismiss = () => { if (state.haunt) lastHauntShown = state.haunt.id; render(); };

// =========================================================================
// LOOP
// =========================================================================
function onResize() {
  if (!renderer) return;
  const wrap = $("canvas-wrap");
  const w = wrap.clientWidth, h = wrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() / 1000;
  const dt = lastFrameT ? Math.min(0.05, t - lastFrameT) : 0.016;
  lastFrameT = t;
  for (const m of tokenAvatarMixers) m.update(dt); // drive rigged-avatar idle clips

  // Cinematic follow camera: a TACTICAL ⇄ CHASE machine on one scalar. While
  // the active explorer walks the camera swoops low and close behind them;
  // when they stop it relaxes back out to the orbit view. A beat's focusPulse
  // briefly pushes in on the room where something just happened, and manual
  // orbit/zoom always wins for a 2.5s hold.
  if (state) {
    const nowMs = performance.now();
    const active = state.players.find((p) => p.id === state.activePlayerId);
    const room = active && active.position ? state.house[active.position] : null;

    // 1. moving signal with debounce + hysteresis -> chase in [0,1]. A human's
    // keyboard/click move is an unambiguous signal: engage almost at once, and
    // linger long enough that chained arrow presses hold one sustained chase.
    // Bot moves keep the longer debounce that absorbs their stutter.
    const humanTurn = !!active && !active.isBot;
    if (followTarget.valid && followTarget.moving) { movingFor += dt; stillFor = 0; }
    else { stillFor += dt; movingFor = 0; }
    if (movingFor > (humanTurn ? 0.05 : 0.12)) chaseWant = 1;
    else if (stillFor > (humanTurn ? 0.7 : 0.45)) chaseWant = 0; // steps chain into one chase
    chase += (chaseWant - chase) * (1 - Math.exp(-(chaseWant > chase ? 5.0 : 1.2) * dt));

    // 2. look point: room center (tactical) -> character chest (chase); a
    // focusPulse retargets the drama's room instead while it lasts.
    const pulse = nowMs < Beats.director.until && Beats.director.focusKey ? state.house[Beats.director.focusKey] : null;
    const lookRoom = pulse || room;
    if (lookRoom) {
      const [cx, cy, cz] = roomWorld(lookRoom);
      camDesired.set(cx, cy + 1.0, cz);
    }
    camLook.copy(camDesired);
    if (!pulse && followTarget.valid) {
      camLook.lerp(camOffset.set(followTarget.pos.x, followTarget.pos.y + 1.2, followTarget.pos.z), chase);
    }
    const err = controls.target.distanceTo(camLook);
    controls.target.lerp(camLook, 1 - Math.exp(-((pulse || err > 10) ? 5.0 : 3.5) * dt));

    // 3+4. spherical framing (radius / polar / azimuth) around the target —
    // paused while the user holds the camera, except a pulse's push-in.
    if (pulse || nowMs - userCamAt > 2500) {
      camSph.setFromVector3(camOffset.copy(camera.position).sub(controls.target));
      camSph.radius = Math.max(0.001, camSph.radius);
      if (chase < 0.02 && chaseWant === 0) polarSaved = Math.min(1.45, Math.max(0.2, camSph.phi));
      const tact = active && active.isBot ? 17 : 20;
      const wantDist = pulse
        ? Math.max(controls.minDistance, 0.55 * tact)
        : tact + (CHASE_DIST - tact) * chase;
      const clamped = Math.min(controls.maxDistance, Math.max(controls.minDistance, wantDist));
      // Asymmetric ease: dive fast enough that the close frame lands mid-hop
      // even on a single one-room move; relax back out more gently.
      camSph.radius += (clamped - camSph.radius) * (1 - Math.exp(-(clamped < camSph.radius ? 3.5 : 2.2) * dt));
      camSph.phi += ((polarSaved + (CHASE_PHI - polarSaved) * chase) - camSph.phi) * (1 - Math.exp(-2.5 * dt));
      if (chase > 0.05 && followTarget.valid) {
        // swing BEHIND the walker, shortest arc (token yaw = direction of travel)
        const thetaBehind = followTarget.yaw + Math.PI;
        const darc = ((thetaBehind - camSph.theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        camSph.theta += darc * (1 - Math.exp(-2.0 * chase * dt));
      }
      camera.position.setFromSpherical(camSph).add(controls.target);
    }
    followTarget.valid = false; // re-armed below by the active living token
  }
  controls.update();

  // Beat FX: light pulses bloom-and-decay, ember bursts rise and gutter out.
  for (let i = fxList.length - 1; i >= 0; i--) {
    const fx = fxList[i];
    fx.t += dt;
    if (fx.kind === "pulse") {
      fx.light.intensity = fx.t < 0.12 ? (fx.t / 0.12) * 26 : 26 * Math.exp(-4 * (fx.t - 0.12));
      if (fx.t > 1.3) { scene.remove(fx.light); fxList.splice(i, 1); }
    } else {
      const attr = fx.points.geometry.getAttribute("position");
      const arr = attr.array, vel = fx.vel;
      for (let j = 0; j < arr.length; j += 3) {
        vel[j + 1] -= 0.6 * S * dt; // gravity
        arr[j] += vel[j] * dt; arr[j + 1] += vel[j + 1] * dt; arr[j + 2] += vel[j + 2] * dt;
      }
      attr.needsUpdate = true;
      fx.points.material.opacity = Math.max(0, 0.9 * (1 - fx.t / 1.6));
      if (fx.t > 1.7) {
        scene.remove(fx.points);
        fx.points.geometry.dispose();
        fx.points.material.dispose();
        fxList.splice(i, 1);
      }
    }
  }

  if (dust) {
    const a = dust.geometry.getAttribute("position");
    const arr = a.array;
    for (let i = 0; i < arr.length; i += 3) { arr[i + 1] += 0.012; if (arr[i + 1] > 20) arr[i + 1] = -18; }
    a.needsUpdate = true;
    dust.rotation.y += 0.0006;
  }
  for (const l of wisps) {
    const b = l.userData.base;
    const seed = b[0] + b[2];
    let f = 1 + Math.sin(t * 23 + seed) * 0.1 + Math.sin(t * 7.3 + seed * 2.1) * 0.16 + Math.sin(t * 1.7 + seed * 0.7) * 0.06;
    if (Math.random() < 0.015) f *= 0.55;
    l.intensity = Math.max(8, 18 * f);
    l.position.set(b[0] + Math.sin(t * 0.5 + b[2]) * 1.75, b[1] + Math.sin(t * 0.7) * 0.4, b[2] + Math.cos(t * 0.4 + b[0]) * 1.75);
  }
  // Ease each token toward its target room/offset and turn it to face the way
  // it's travelling, so a move reads as walking rather than a teleport.
  for (const tok of tokenCache.values()) {
    const g = tok.group;
    if (!tok.placed) { g.position.copy(tok.target); tok.placed = true; tok.path = null; }
    const px = g.position.x, pz = g.position.z;
    if (tok.path) {
      // Waypoint walk: consume the planned ring/door points at constant
      // WALK_SPEED, easing out over the last stretch into the final slot.
      let budget = WALK_SPEED * dt;
      while (budget > 1e-5 && tok.path.length) {
        const w = tok.path[0];
        _walkV.subVectors(w, g.position);
        const dist = _walkV.length();
        const k = tok.path.length === 1 ? Math.max(0.35, Math.min(1, dist / 1.2)) : 1; // ease-out
        const step = budget * k;
        if (dist <= step) { g.position.copy(w); tok.path.shift(); budget -= dist / k; }
        else { g.position.addScaledVector(_walkV.multiplyScalar(1 / dist), step); budget = 0; }
      }
      if (!tok.path.length) tok.path = null;
    } else {
      // Direct glide — floor changes and non-adjacent jumps (stairs, elevator,
      // falls). k = 4.5 × (4/7) ≈ 2.6 keeps peak world-speed matched to the
      // walk clip over a 7-unit hop (settles in ~1.15s).
      g.position.lerp(tok.target, 1 - Math.exp(-2.6 * dt));
    }
    const dx = g.position.x - px, dz = g.position.z - pz;
    if (dx * dx + dz * dz > 1e-6) {
      const desired = Math.atan2(dx, dz);
      const d = ((desired - tok.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      tok.yaw += d * (1 - Math.exp(-12 * dt));
    }
    g.rotation.y = tok.yaw;
    // Feet match the glide: the rigged body strides while covering ground and
    // settles back to idle on arrival. The dead stay exactly as they fell.
    if (tok.kind === "p" && !tok.dead) {
      const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(1e-4, dt);
      // Hysteresis so the clip can't flap right at the threshold.
      tok.walking = speed > (tok.walking ? 0.4 : 0.8);
      setAvatarClip(g, tok.walking ? "walk" : "idle");
      // The active explorer feeds the follow camera — same walking signal as
      // the stride clip, so the swoop and the animation can never disagree.
      if (tok.active) {
        followTarget.pos.copy(g.position);
        followTarget.yaw = tok.yaw;
        followTarget.moving = tok.walking;
        followTarget.valid = true;
      }
    }
    if (!tok.dead) animateFigure(tok.fig, t, { active: tok.active, phase: tok.phase, baseY: tok.baseY });
  }

  // Ease every door toward its open/closed target and swing the leaf on its hinge.
  const nowMs = performance.now();
  for (const e of doorCache.values()) {
    if (e.openTarget === 1 && nowMs > e.closeAt) e.openTarget = 0;
    e.open += (e.openTarget - e.open) * (1 - Math.exp(-7 * dt));
    e.pivot.rotation.y = -e.open * DOOR_MAX_SWING;
  }

  // X-ray walls: any wall — including a doorway's stubs and header — between
  // the camera and a living character ghosts to 0.12, and the followed room's
  // camera-facing walls always do; smoothly, per-mesh. Wall-height decor trim
  // (cornice/beams/pilasters) ghosts with its room the same way — a zero
  // normal in aEntry.walls marks trim. Door leaves, jambs and furniture never
  // fade (the opening reads through on its own).
  if (state && xrayWalls.length) {
    // A. raycast camera -> every living character's chest
    for (const tok of tokenCache.values()) {
      if (tok.kind === "p" && tok.dead) continue;
      xrayDir.copy(tok.group.position);
      xrayDir.y += tok.kind === "p" ? 1.2 : 1.0; // chest height
      xrayDir.sub(camera.position);
      const len = xrayDir.length();
      xrayRay.origin.copy(camera.position);
      xrayRay.direction.copy(xrayDir).normalize();
      for (const w of xrayWalls) {
        if (xrayRay.intersectBox(w.userData.xray.box, xrayHit) && xrayHit.distanceTo(camera.position) < len - 0.25) {
          w.userData.xray.until = nowMs + XRAY_HOLD_MS;
        }
      }
    }
    // B. the active player's room: its near-side walls ghost from any angle
    const activeP = state.players.find((p) => p.id === state.activePlayerId);
    const aRoom = activeP && activeP.position ? state.house[activeP.position] : null;
    const aEntry = aRoom ? roomCache.get(aRoom.key) : null;
    if (aEntry && aEntry.walls) {
      const [rx, , rz] = roomWorld(aRoom);
      xrayDir.set(camera.position.x - rx, 0, camera.position.z - rz).normalize();
      for (const w of aEntry.walls) {
        const x = w.userData.xray;
        if (x.normal.lengthSq() === 0 || x.normal.dot(xrayDir) > 0.15) x.until = nowMs + XRAY_HOLD_MS;
      }
    }
    // C. fade application — the ONLY code allowed to touch wall opacity.
    for (const w of xrayWalls) {
      const m = w.material;
      const target = nowMs < w.userData.xray.until ? XRAY_OPACITY : 1;
      m.opacity += (target - m.opacity) * (1 - Math.exp(-(target < m.opacity ? 10 : 4) * dt));
      const solid = m.opacity > 0.985;
      m.transparent = !solid;
      m.depthWrite = solid; // opaque pass when fully solid: no sorting artifacts
      if (solid) m.opacity = 1;
    }
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// =========================================================================
// WARDROBE — an animated 3D preview of the focused character at select time
// =========================================================================
let wScene, wCam, wRenderer, wTurn, wFig, wRAF;
const wMixers = []; // wardrobe-preview avatar animation mixers
let wLastT = 0;
function initWardrobe() {
  const stage = $("wardrobe-stage");
  if (!stage) return;
  const w = stage.clientWidth || 300, h = stage.clientHeight || 340;
  wRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  wRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  wRenderer.setSize(w, h);
  // Same filmic response as the game view, so the portrait matches in-game skin.
  wRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  wRenderer.toneMappingExposure = 1.12;
  wRenderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(wRenderer.domElement);
  wScene = new THREE.Scene();
  wCam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
  // Framed for the tallest explorer (Crow, 1.9) with a little headroom.
  wCam.position.set(0, 1.12, 2.85);
  wCam.lookAt(0, 0.92, 0);
  // A faint studio environment gives the physical materials (skin sheen, wet
  // eyes, gold) something to reflect; intensity kept low for the mood. A tiny
  // procedural equirect — PMREM-from-scene stalls SwiftShader for >30s.
  wScene.environment = makeStudioEnvTexture();
  wScene.environmentIntensity = 0.32;
  // Three-point portrait: warm key high right, cool soft fill left, amber rim
  // behind the shoulder, and a whisper of bounce from the pedestal.
  wScene.add(new THREE.AmbientLight(0x4a4660, 0.35));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.1); key.position.set(1.9, 3.1, 2.7); wScene.add(key);
  const fill = new THREE.DirectionalLight(0x7d95c9, 0.6); fill.position.set(-2.8, 1.5, 2.2); wScene.add(fill);
  const rim = new THREE.PointLight(0xe8975a, 13, 9, 2); rim.position.set(-0.7, 2.3, -1.8); wScene.add(rim);
  const bounce = new THREE.DirectionalLight(0x8a6a58, 0.3); bounce.position.set(0.4, -1, 2.5); wScene.add(bounce);
  const ped = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.62, 0.1, 36),
    new THREE.MeshStandardMaterial({ color: 0x171320, roughness: 0.85 }),
  );
  ped.position.y = -0.05; wScene.add(ped);
  wTurn = new THREE.Group(); wScene.add(wTurn);
  (function loop() {
    if (!wRenderer) return;
    wRAF = requestAnimationFrame(loop);
    const t = performance.now() / 1000;
    const dt = wLastT ? Math.min(0.05, t - wLastT) : 0.016;
    wLastT = t;
    wTurn.rotation.y = t * 0.5;
    for (const m of wMixers) m.update(dt);
    if (wFig && wFig.visible) animateFigure(wFig, t, { active: true, baseY: 0.02 });
    wRenderer.render(wScene, wCam);
  })();
}
function wardrobeShow(charId) {
  if (!wScene) return;
  const c = DH.CHARACTERS_BY_ID[charId];
  if (!c) return;
  if (wFig) {
    wTurn.remove(wFig);
    // Dispose materials too, not just geometry — each hover builds a fresh figure
    // with freshly-allocated materials, which the GPU won't free on GC alone.
    wFig.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
    });
  }
  // Drop any previously-loaded rigged avatar + its mixer before showing the next.
  if (wTurn.userData.avatar) { wTurn.remove(wTurn.userData.avatar); wTurn.userData.avatar = null; }
  wTurn.userData.anim = null;
  wTurn.userData.wantClip = null;
  wMixers.length = 0;
  wFig = buildExplorerFigure(c.color, { archetype: charId });
  // If this character has a real rigged model, show it instead of the figure —
  // it greets you with a wave, then settles into its idle.
  if (attachAvatar(wTurn, charId, 1.5, wMixers, { greet: true })) wFig.visible = false;
  wTurn.add(wFig);
  $("w-name").textContent = c.name;
  $("w-title").textContent = `${c.title}, ${c.age}`;
  $("w-flavor").textContent = c.flavor;
  // The dossier: what the house already knows about this guest.
  const dossier = [
    ["Born", c.birthday],
    ["Keeps", c.keepsake],
    ["Fears", c.fear],
    ["Hobbies", c.hobbies.join(" · ")],
  ];
  $("w-dossier").innerHTML = dossier
    .map(([k, v]) => `<div class="dossier-row"><span class="dossier-key">${k}</span><span>${v}</span></div>`)
    .join("");
  $("w-bio").textContent = c.bio;
  // The red thread: the bond tying this explorer to another of the six.
  const bondTo = DH.CHARACTERS_BY_ID[c.bond.with];
  const bondEl = $("w-bond");
  bondEl.innerHTML =
    `<span class="bond-thread">●</span> <button class="bond-link" style="color:${bondTo.color}">${bondTo.name}</button> — ${c.bond.text}`;
  bondEl.querySelector(".bond-link").onclick = () => wardrobeShow(bondTo.id);
  $("w-traits").innerHTML = DH.TRAITS.map((t) => `<span class="trait-chip">${t.slice(0, 3)} ${c.traits[t].values[c.traits[t].start]}</span>`).join("");
  const inParty = party.some((p) => p.charId === charId);
  const btn = $("w-pick");
  btn.textContent = inParty ? "✓ In party — remove" : "Add to party";
  btn.className = "btn" + (inParty ? " primary" : "");
  btn.onclick = () => toggleParty(charId);
}
function toggleParty(charId) {
  const idx = party.findIndex((p) => p.charId === charId);
  if (idx >= 0) party.splice(idx, 1); else party.push({ pid: "p" + charId, charId });
  buildLobby();
  wardrobeShow(charId);
}
function stopWardrobe() {
  if (wRAF) cancelAnimationFrame(wRAF);
  wRenderer = null;
}

// Headless-verification handle (scripts/screenshot.mjs): read the live state
// and force a re-render after mutating it. Harmless in normal play.
Object.defineProperty(window, "__dh", {
  value: { get state() { return state; }, render: () => render() },
});

// boot
$("begin-btn").onclick = () => beginGame(false);
$("solo-btn").onclick = () => beginGame(true);
$("sound-btn").onclick = () => { if (!Sound.started) Sound.start(); else Sound.toggle(); syncSoundBtn(); };
syncSoundBtn();

// Difficulty selector (lobby)
for (const b of document.querySelectorAll("#difficulty .diff-opt")) {
  b.onclick = () => {
    chosenDifficulty = b.dataset.d;
    document.querySelectorAll("#difficulty .diff-opt").forEach((o) => o.classList.toggle("sel", o === b));
  };
}

// How-to-play overlay
const helpOv = $("help-overlay");
const openHelp = () => helpOv.classList.add("show");
const closeHelp = () => helpOv.classList.remove("show");
$("howto-btn").onclick = openHelp;
$("help-btn").onclick = openHelp;
$("help-close").onclick = closeHelp;
helpOv.onclick = (e) => { if (e.target === helpOv) closeHelp(); };

// Legacy campaign entry point
$("legacy-btn").onclick = openLegacy;
for (const id of ["campaign-overlay", "legacy-overlay"]) {
  const ov = $(id);
  ov.onclick = (e) => { if (e.target === ov && id === "campaign-overlay") ov.classList.remove("show"); };
}
{
  const saved = loadCampaign();
  if (saved) $("legacy-btn").textContent = `🕯️ Continue Legacy · Ch.${saved.chapter}`;
}

initWardrobe();
buildLobby();
wardrobeShow(DH.CHARACTERS[0].id);
