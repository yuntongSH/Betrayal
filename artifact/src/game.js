import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { buildRoomDecor, roomTheme, buildExplorerFigure, buildMonsterFigure, animateFigure, materials, surfaceFor, attachKeepsake, refineExplorerAvatar, attachAvatarLife, makeStudioEnvTexture, createDreadScore, ISLAND_R, RING, REACTION_CLIPS } from "@dread-hollow/decor";

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
const CARD_HOLD_MS = 6500; // every non-interactive card/death reveal holds this long
// A reveal must not freeze the world before its walk visibly lands: while the
// active token is still mid-path the modal defers, retrying until a cap.
const BEAT_WAIT_RETRY_MS = 150;
const BEAT_WAIT_MAX_MS = 3500; // per beat — after this, show anyway
// End-turn shine + auto-end: when strictly NOTHING remains this turn, the End
// turn button glows and a 5s bar drains; then the turn ends itself.
const AUTO_END_MS = 5000;
const AUTO_END_RETRY_MS = 400; // a modal at fire time postpones, not cancels
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
/** A hero's baked 2D face (head crop of the 3D model, shipped next to the
 *  glTF bodies). Rendered INSIDE a medallion over the initial letter — if the
 *  image ever fails to load it removes itself and the letter shows again. */
const pface = (id) =>
  `<img class="pface" src="models/portraits/${id}.webp" alt="" draggable="false" onerror="this.remove()">`;
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
  // A one-shot reaction owns the body until its clip finishes — the base wish
  // is remembered above (wantClip) and restored by the mixer's `finished`
  // handler. Only death interrupts a reaction mid-swing.
  if (anim.oneShot) {
    if (name !== "death") return;
    anim.oneShot.action.fadeOut(ONE_SHOT_FADE_IN);
    anim.oneShot = null;
  }
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
        // Reaction one-shots resolve by EXACT clip name — the map is shared
        // with the React client via @dread-hollow/decor so the same beat plays
        // the same motion everywhere.
        const byName = (n) => {
          const c = gltf.animations.find((a) => a.name === n);
          return c ? mixer.clipAction(c) : null;
        };
        const anim = {
          mixer,
          actions: {
            idle: pick(/^idle$/i) || mixer.clipAction(gltf.animations[0]),
            idle2: pick(/^idle_neutral$/i), // fidget variant (Feature: idle variety)
            walk: pick(/^walk$/i),
            death: pick(/^death$/i),
            wave: pick(/^wave$/i),
          },
          react: {
            hit: byName(REACTION_CLIPS.hit),
            stagger: byName(REACTION_CLIPS.stagger),
            interact: byName(REACTION_CLIPS.interact),
            attack: REACTION_CLIPS.attack.map(byName),
            cheer: byName(REACTION_CLIPS.cheer),
          },
          current: null,
          oneShot: null, // { action, kind } while a reaction clip owns the body
        };
        group.userData.anim = anim;
        mixer.addEventListener("finished", (e) => {
          // A reaction one-shot lands: crossfade back to whatever base clip the
          // token wants right now (idle/walk — wantClip is maintained per frame).
          if (anim.oneShot && e.action === anim.oneShot.action) {
            anim.oneShot = null;
            e.action.fadeOut(ONE_SHOT_FADE_OUT);
            anim.current = null; // force the fade-in even if wantClip == old base
            setAvatarClip(group, group.userData.wantClip || "idle", ONE_SHOT_FADE_OUT);
            return;
          }
          // A wardrobe greeting settles into idle once the wave finishes.
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

// ---- one-shot body reactions ----------------------------------------------
// LoopOnce clips from REACTION_CLIPS (shared with the React client): a flinch
// when a wound lands, a heavier stagger at the haunt reveal, a crouch to
// investigate, alternating punches on an attack, a cheer for the winners.
// While one plays it owns the body (setAvatarClip defers to it, death excepted)
// and the finished handler crossfades back to the token's base clip. The
// governor treats a playing reaction as scene-busy (see sceneBusy) so the
// motion never judders at the idle 24fps cadence.
const ONE_SHOT_FADE_IN = 0.15;
const ONE_SHOT_FADE_OUT = 0.25;
const STAGGER_MAX_DELAY_MS = 450; // haunt reveal: the party reels a beat apart
const CHEER_MAX_DELAY_MS = 600; // winners celebrate loosely together
// Involuntary reactions (hit/stagger) replace deliberate ones (interact/attack/
// cheer), never the other way around; equals replace (a fresh hit re-flinches).
const REACT_PRIO = { hit: 2, stagger: 2, attack: 1, interact: 1, cheer: 1 };

/** Play a one-shot reaction on a token's rigged avatar. Safe no-op when the
 *  model hasn't loaded, the token is dead/dying, or a higher-priority reaction
 *  is mid-swing. */
function playOneShot(tok, kind) {
  if (!tok || tok.dead) return;
  const group = tok.group;
  const anim = group.userData.anim;
  if (!anim || group.userData.wantClip === "death") return; // never interrupt death
  const cur = anim.oneShot;
  if (cur && REACT_PRIO[kind] < REACT_PRIO[cur.kind]) return;
  let action = anim.react[kind];
  if (kind === "attack") {
    // Alternate fists for variety, starting on a random side.
    tok.punch = tok.punch === undefined ? (Math.random() * 2) | 0 : 1 - tok.punch;
    action = anim.react.attack[tok.punch] || anim.react.attack[1 - tok.punch];
  }
  if (!action) return;
  if (cur && cur.action !== action) cur.action.fadeOut(ONE_SHOT_FADE_IN);
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = false;
  action.fadeIn(ONE_SHOT_FADE_IN).play();
  if (anim.current && anim.current !== action) anim.current.fadeOut(ONE_SHOT_FADE_IN);
  anim.current = null; // the base clip resumes via the mixer's finished handler
  anim.oneShot = { action, kind };
}

/** Body language for a dispatched action: the acting player's token plays the
 *  matching one-shot. Called for humans (act) and bots (driveBots) alike —
 *  monsters stay procedural figures and never route through here. */
function reactToAction(action) {
  if (action.type === "investigate") playOneShot(tokenCache.get(action.playerId), "interact");
  else if (action.type === "attack") playOneShot(tokenCache.get(action.playerId), "attack");
}

/** The haunt reveal: every living explorer reels, each a random beat apart. */
function triggerHauntStagger() {
  for (const [id, tok] of tokenCache) {
    if (tok.kind !== "p" || tok.dead) continue;
    setTimeout(() => {
      const tk = tokenCache.get(id); // re-look-up: a new game may have retired it
      if (tk && !tk.dead) playOneShot(tk, "stagger");
    }, Math.random() * STAGGER_MAX_DELAY_MS);
  }
}

let cheeredGame = null; // the state object whose winners already cheered
/** Game over: living explorers on the winning side celebrate, once each. */
function triggerCheers() {
  if (!state || cheeredGame === state || !state.winner) {
    cheeredGame = state;
    return;
  }
  cheeredGame = state;
  for (const p of state.players) {
    if (!p.alive || p.side !== state.winner) continue;
    const id = p.id;
    setTimeout(() => {
      const tk = tokenCache.get(id);
      if (tk && !tk.dead) playOneShot(tk, "cheer");
    }, Math.random() * CHEER_MAX_DELAY_MS);
  }
}
const SPECIAL_GLOW = {
  "heal-sanity": 0x6fb6b5, "heal-might": 0xe8a85a, "drain-speed": 0x5a6f9a,
  pit: 0x3a2a2a, "draw-extra-omen": 0x8c2f23, vault: 0xc8a23a,
};
const DIRS = ["north", "east", "south", "west"]; // clockwise — index+1 is a right turn
// Arrows/WASD are MAP-ABSOLUTE (see onKeyMove): ↑ is always north on the
// minimap, ← always west — the keys agree with the bird's-eye map regardless
// of camera orbit or which way the hero stands.
const SCREEN_KEY = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};
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

// ---- audio (Web Audio) ----------------------------------------------------
// Diegetic SFX (door creaks) stay procedural and local; the MUSIC — an
// adaptive score with scenes (lobby / explore / haunt / ended), a peril layer
// and card/death/reveal stings — is the shared engine from
// @dread-hollow/decor (createDreadScore). Everything hangs off one
// AudioContext created inside a user gesture (browser autoplay unlock): the
// first click/keypress on the page, or the lobby Begin button.
const Sound = (() => {
  let ctx = null, master = null, score = null, started = false, muted = false, lastDoor = 0;
  let scene = "lobby"; // remembered so a scene chosen before start() lands then
  const VOL = 0.26; // SFX bus level — the score manages its own internal mix
  function noise(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
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
  return {
    start() {
      if (started) return;
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      ctx = new C();
      if (ctx.state === "suspended") ctx.resume(); // we're inside a user gesture
      master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      started = true;
      master.gain.linearRampToValueAtTime(muted ? 0 : VOL, ctx.currentTime + 2);
      score = createDreadScore(ctx);
      score.start();
      score.setScene(scene);
      if (muted) score.setVolume(0);
    },
    door() { const now = performance.now(); if (now - lastDoor < 350) return; lastDoor = now; creak(330 + Math.random() * 220, 0.6, 0.22); },
    /** Near-death heartbeat state — forwarded to the score's peril layer. */
    setHeart(on) { score?.setPeril(!!on); },
    /** Game phase -> musical scene: "lobby" | "explore" | "haunt" | "ended". */
    setScene(s) { if (s === scene) return; scene = s; score?.setScene(s); },
    /** One-shot musical sting: "omen" | "event" | "item" | "death" | "reveal". */
    sting(kind) { if (!muted) score?.sting(kind); },
    setMuted(m) {
      muted = m;
      if (ctx && master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(m ? 0 : VOL, ctx.currentTime + 0.5); }
      score?.setVolume(m ? 0 : 1);
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

// =========================================================================
// DICE TRAY — every roll the engine logs (a `dice` array of d6 faces 0/1/2)
// plays as a centered lower-third overlay: the dice tumble, settle on the
// real values, then a verdict line reads the outcome. Pure DOM/CSS, so it
// animates even while a modal beat freezes the 3D world. One tray at a time;
// simultaneous rolls queue.
// =========================================================================
const DICE_TUMBLE_MS = 900; // spin before the dice settle on their real faces
const DICE_STAGGER_MS = 90; // per-die settle offset
const DICE_HOLD_MS = 2600; // read time after the last die settles
const DICE_FADE_MS = 450;
const DICE_GAP_MS = 160; // breath between queued trays
const DICE_CARD_LINGER_MS = 1200; // an open card modal outlives the tray by this
const DICE_QUEUE_MAX = 3; // showing + pending — presentation must not lag the game
const DIE_PIPS = ["", "•", "• •"]; // Betrayal d6 faces 0 / 1 / 2

function trayDuration(n) {
  return DICE_TUMBLE_MS + (n - 1) * DICE_STAGGER_MS + DICE_HOLD_MS + DICE_FADE_MS + DICE_GAP_MS;
}

/** Human verdict for a rolled log entry — "Might 4 — rolled 5 · success",
 *  coloured green/red only when the text makes success determinable. */
function diceVerdict(e) {
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  const total = e.dice.reduce((a, b) => a + b, 0);
  let m;
  // "X rolls might · 5 vs 4: success."
  if ((m = e.text.match(/rolls (\w+) · (\d+) vs (\d+): (success|failure)/))) {
    return { text: `${cap(m[1])} ${m[3]} · rolled ${m[2]} · ${m[4]}`, cls: m[4] === "success" ? "ok" : "bad" };
  }
  // "X makes the haunt roll: 4 vs 3 omen(s) in play." (roll < omens = the turn)
  if ((m = e.text.match(/haunt roll: (\d+) vs (\d+) omen/))) {
    const holds = +m[1] >= +m[2];
    return { text: `Haunt roll: ${m[1]} vs ${m[2]} omens · ${holds ? "the house holds" : "the house turns"}`, cls: holds ? "ok" : "bad" };
  }
  // "X studies the shadows: Knowledge 3 vs 4."
  if ((m = e.text.match(/: (\w+) (\d+) vs (\d+)/))) {
    const ok = +m[2] >= +m[3];
    return { text: `${cap(m[1])} ${m[3]} · rolled ${m[2]} · ${ok ? "success" : "failure"}`, cls: ok ? "ok" : "bad" };
  }
  // Combat and friends: the log line already narrates the outcome.
  return { text: `${e.text.replace(/\.\s*$/, "")} · rolled ${total}`, cls: "" };
}

const DiceTray = (() => {
  const queue = []; // pending log entries with dice
  let cur = null; // { el, timers, cycle, endAt }
  let endsAtMs = 0; // when everything queued (incl. showing) finishes

  function recomputeEnd() {
    let t = cur ? cur.endAt : performance.now();
    for (const e of queue) t += trayDuration(e.dice.length);
    endsAtMs = t;
  }
  function show() {
    const e = queue.shift();
    if (!e) { cur = null; return; }
    const layer = $("dice-layer");
    if (!layer) { cur = null; queue.length = 0; return; }
    const n = e.dice.length;
    const v = diceVerdict(e);
    const el = document.createElement("div");
    el.className = "dice-tray";
    el.innerHTML =
      `<div class="dice-row">` +
      e.dice.map((_, i) => `<span class="die" style="animation-delay:${i * DICE_STAGGER_MS}ms"></span>`).join("") +
      `</div><div class="dice-verdict${v.cls ? " " + v.cls : ""}">${v.text}</div>`;
    layer.appendChild(el);
    const dice = [...el.querySelectorAll(".die")];
    const timers = [];
    // Faces flicker while the dice tumble, then each settles on its real value
    // (die + die-N) in stagger order; the verdict fades in once all have landed.
    for (const d of dice) d.textContent = DIE_PIPS[(Math.random() * 3) | 0];
    const cycle = setInterval(() => {
      for (const d of dice) if (!d.dataset.settled) d.textContent = DIE_PIPS[(Math.random() * 3) | 0];
    }, 110);
    dice.forEach((d, i) => {
      timers.push(setTimeout(() => {
        d.dataset.settled = "1";
        d.classList.add("die-" + e.dice[i]);
        d.textContent = DIE_PIPS[e.dice[i]] ?? String(e.dice[i]);
      }, DICE_TUMBLE_MS + i * DICE_STAGGER_MS));
    });
    const settled = DICE_TUMBLE_MS + (n - 1) * DICE_STAGGER_MS;
    timers.push(setTimeout(() => {
      clearInterval(cycle);
      el.querySelector(".dice-verdict").classList.add("show");
    }, settled));
    timers.push(setTimeout(() => el.classList.add("out"), settled + DICE_HOLD_MS));
    timers.push(setTimeout(() => {
      el.remove();
      cur = null;
      show();
    }, settled + DICE_HOLD_MS + DICE_FADE_MS + DICE_GAP_MS));
    cur = { el, timers, cycle, endAt: performance.now() + trayDuration(n) };
    recomputeEnd();
  }

  return {
    /** Is a tray on screen or waiting to be? */
    busy: () => !!cur || queue.length > 0,
    /** When the last queued tray will have fully faded (performance.now() ms). */
    endsAt: () => endsAtMs,
    enqueue(entry) {
      if (!entry.dice || !entry.dice.length) return;
      queue.push(entry);
      // Never two at once — and never an unbounded backlog (a monster phase can
      // log several combats in one dispatch): oldest pending rolls drop.
      while (queue.length > DICE_QUEUE_MAX) queue.shift();
      recomputeEnd();
      if (!cur) show();
      // An open card modal must outlive the roll it demanded.
      Beats.extendForDice();
    },
    reset() {
      queue.length = 0;
      endsAtMs = 0;
      if (cur) {
        clearInterval(cur.cycle);
        for (const t of cur.timers) clearTimeout(t);
        cur.el.remove();
        cur = null;
      }
    },
  };
})();

const Beats = (() => {
  let CARD_BY_NAME = null; // card name -> def, built lazily (all 35 names unique)
  const queue = []; // pending modal beats (card / death)
  let active = null; // the modal currently on screen
  let gapTimer = null, autoTimer = null, waitTimer = null;
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
  // Card v2 — an occult trading card: engraved layered frame with corner
  // ornaments, a type ribbon, an art plate (the type's sigil over a procedural
  // backdrop), display-serif name over a thin rule, rules text, and a footer
  // naming the drawer. The timer bar and Continue hook are unchanged.
  function cardHtml(b) {
    const t = b.cardType;
    return `<div class="card-flip"><div class="draw-card t-${t}">` +
      `<div class="card-frame"><i></i><i></i><i></i><i></i></div>` +
      `<div class="card-ribbon">${t.toUpperCase()}</div>` +
      `<div class="card-art"><div class="card-art-icon">${BEAT_SVG[t]}</div></div>` +
      `<div class="card-kicker">${BEAT_KICKER[t]}</div>` +
      `<div class="card-name">${b.name}</div>` +
      `<div class="card-rules">${b.text}</div>` +
      `<div class="card-footer">${b.playerName} draws</div>` +
      `<button class="btn primary dc-continue">Continue ▸</button>` +
      (b.interactive ? "" : `<div class="card-timer" style="animation-duration:${CARD_HOLD_MS}ms"></div>`) +
      `</div></div>`;
  }
  function deathHtml(b) {
    const c = DH.CHARACTERS_BY_ID[b.charId];
    return `<div class="death-banner">` +
      `<div class="db-disc" style="--pc:${c?.color ?? "#888"}">${c?.name.charAt(0) ?? "?"}${c ? pface(c.id) : ""}</div>` +
      `<div class="kick">LOST TO THE HOUSE</div>` +
      `<h2>${c?.name ?? b.playerName}</h2>` +
      `<div class="muted">${c?.title ?? ""}</div>` +
      `<div class="db-words">“${c?.lines.death ?? "…"}”</div>` +
      `<button class="btn primary dc-continue">Continue ▸</button>` +
      (b.interactive ? "" : `<div class="card-timer" style="animation-duration:${CARD_HOLD_MS}ms"></div>`) +
      `</div>`;
  }
  /** Is the token whose move this beat reveals still visibly walking? A bot's
   *  move updates state instantly — the card must not flip (and freeze the
   *  world) while the body is still crossing the room. */
  function walkerBusy() {
    if (!state) return false;
    const tok = tokenCache.get(state.activePlayerId);
    // followTarget.moving is only trustworthy when the active living token
    // armed it this frame (valid) — a dead-but-active player leaves it stale.
    return !!((followTarget.valid && followTarget.moving) || (tok && tok.path));
  }
  function showNext() {
    if (active || !queue.length) return;
    // Gate on arrival: defer while the walker is mid-path (150ms retries,
    // capped per beat) so the freeze engages only after the walk lands.
    const head = queue[0];
    if (walkerBusy()) {
      head.showBy ??= performance.now() + BEAT_WAIT_MAX_MS;
      if (performance.now() < head.showBy) {
        clearTimeout(waitTimer);
        waitTimer = setTimeout(showNext, BEAT_WAIT_RETRY_MS);
        return;
      }
    }
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
    if (b.kind === "death") Sound.sting("death");
    else Sound.sting(b.cardType);
    // Every reveal gets its full reading time — no backlog fast-drain (driveBots
    // pauses while a beat is up, so the queue stays bounded regardless). A card
    // whose action also rolled dice holds until the tray finishes + a linger.
    if (!b.interactive) {
      b.shownAt = performance.now();
      const hold = Math.max(
        CARD_HOLD_MS,
        DiceTray.busy() ? DiceTray.endsAt() - b.shownAt + DICE_CARD_LINGER_MS : 0,
      );
      autoTimer = setTimeout(dismiss, hold);
      if (hold > CARD_HOLD_MS) {
        const bar = back.querySelector(".card-timer");
        if (bar) bar.style.animationDuration = `${hold}ms`;
      }
    }
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
    if (def.aura > 0) return beatToast("✦", `Blessed ground: +${def.aura} die to every roll here`, "#e2c15a");
    if (def.aura < 0) return beatToast("☓", `Cursed ground: ${def.aura} dice to every roll here`, "#c2412f");
    const sp = def.special;
    if (sp === "mystic-elevator") return beatToast("⇅", "The Caged Lift: it can carry you to another floor", "#8f6fd8");
    if (sp === "grand-staircase" || sp === "stairs-up" || sp === "stairs-down") return beatToast("⇗", "Stairs: change floors here", "#e2a85a");
    if (sp === "vault") return beatToast("🗝", "A sealed vault… it wants the Iron Key", "#e2a85a");
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
    /** The 3D world holds its breath only while a modal is actually ON SCREEN —
     *  a queued beat deferring on the walker leaves time running so the walk
     *  can visibly land first (input stays locked via idle() regardless). */
    freeze: () => !!active,
    skip: dismiss,
    /** A roll landed while a card is up: the card's auto-dismiss stretches
     *  until the dice tray finishes + DICE_CARD_LINGER_MS, bar included. */
    extendForDice() {
      if (!active || active.interactive || !autoTimer) return;
      const now = performance.now();
      const remain = Math.max(
        (active.shownAt ?? now) + CARD_HOLD_MS - now,
        DiceTray.endsAt() - now + DICE_CARD_LINGER_MS,
      );
      clearTimeout(autoTimer);
      autoTimer = setTimeout(dismiss, remain);
      const bar = active.el?.querySelector(".card-timer");
      if (bar) {
        bar.style.animation = "none";
        void bar.offsetWidth; // reflow so the drain restarts over the new span
        bar.style.animation = `card-timer-drain ${remain}ms linear both`;
      }
    },
    /** New game: drop queued beats and consumed ids (log ids restart at 1). */
    reset() {
      queue.length = 0;
      clearTimeout(autoTimer); autoTimer = null;
      clearTimeout(gapTimer); gapTimer = null;
      clearTimeout(waitTimer); waitTimer = null;
      if (active) { active.el?.remove(); active = null; }
      consumed.clear();
      recentDeltas.length = 0;
      director.focusKey = null; director.until = 0;
      DiceTray.reset();
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
      // Every fresh entry carrying dice plays through the tray, in log order.
      for (const e of fresh) if (e.dice?.length) DiceTray.enqueue(e);
      const deadSeen = new Set(); // several deaths in one action each get a banner
      for (const e of fresh) {
        let m;
        if (e.kind === "move" && (m = e.text.match(/^(.+) discovers the (.+)\.$/))) {
          const p = byName(m[1]);
          // Belt and braces: only a genuinely new room key counts as a discovery.
          if (p?.position && !snap.houseKeys.has(p.position)) {
            consumed.add(e.id);
            beatToast("◈", `Discovered: ${m[2]}`, "#d8c090");
            focusPulse(p.position);
            spawnBeatFx(p.position, "discovery", false);
            Sound.door();
          }
        } else if (e.kind === "card" && (m = e.text.match(/^(.+) triggers an Event · (.+?): /))) {
          pushCard(e, "event", m[2], m[1]);
        } else if (e.kind === "card" && (m = e.text.match(/^(.+) picks up an Item: (.+)\.$/))) {
          pushCard(e, "item", m[2], m[1]);
        } else if (e.kind === "card" && (m = e.text.match(/^(.+) uncovers an Omen: (.+)\.$/))) {
          pushCard(e, "omen", m[2], m[1]);
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
      // Kick the queue on the next tick, not synchronously: ingest runs inside
      // dispatch(), BEFORE render() plans the mover's walk path — checked now,
      // the walker would always look idle and the card would beat the walk.
      if (!active && !gapTimer) {
        clearTimeout(waitTimer);
        waitTimer = setTimeout(showNext, 0);
      }
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
    ? `<ul class="camp-list">${c.heirlooms.map((h) => `<li><b>${h.name}</b> <span class="camp-gen">· ${DH.CHARACTERS_BY_ID[h.charId]?.name.split(" ").pop() ?? "family"}, +${h.level} ${h.trait}</span></li>`).join("")}</ul>`
    : `<div class="camp-empty">No heirlooms forged yet.</div>`;
  const scarIds = Object.keys(c.scars);
  const scars = scarIds.length
    ? `<ul class="camp-list">${scarIds.map((rid) => `<li><b>${DH.ROOMS_BY_ID[rid]?.name ?? rid}</b> <span class="camp-gen">· ${c.scars[rid]}</span></li>`).join("")}</ul>`
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
    `Chapter ${c.chapter}, ${hn}: ` +
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
      `<p class="camp-empty">Name one item your line carried through; it will pass down, stronger.</p>` +
      `<div class="legacy-pick" id="legacy-pick">` +
      forgeable.map((id) => {
        const existing = c.heirlooms.find((h) => h.cardId === id && h.charId === c.humanCharId);
        const lbl = existing ? `${existing.name} (strengthen)` : (DH.getCard(id)?.name ?? id);
        return `<button class="btn" data-card="${id}">${lbl}</button>`;
      }).join("") + `</div><div id="forge-slot"></div>`;
  } else {
    body += `<p class="camp-empty">${me && me.alive ? "Your bearer carries nothing to pass down this time." : "Your bearer did not survive. A hardier heir will take up the name."}</p>`;
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
  Sound.setScene("lobby");
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
let animT = 0; // the WORLD's clock (s) — halts while a modal beat freezes the scene
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
// X-ray walls: every room-perimeter wall mesh PLUS the ENTIRE doorway
// assembly (stubs, header, jambs, leaf, panels, knob), tagged so any of them
// between the camera and a living character can ghost to 0.12 opacity. Door
// pieces carry BOTH adjacent room keys, so the followed room's boundary ghosts
// door-and-all; only furniture never fades.
const xrayWalls = []; // flat registry, rebuilt whenever the room/door count changes
const doorsByRoom = new Map(); // room key -> door xwall meshes bounding it (pass B index)
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
    card.style.setProperty("--pc", c.color); // identity colour — CSS derives the cameo backdrop + medallion from it
    card.innerHTML =
      `<div class="char-avatar">${c.name.charAt(0)}${pface(c.id)}</div>` +
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
  // 1024² map (was 2048²): a quarter of the shadow fill-rate/VRAM; PCFSoft
  // filtering hides the coarser texels at this camera distance.
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
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

/** Arrow keys / WASD move the active human player relative to the HERO's
 *  facing (↑ = the way he faces, ← → = his flanks, ↓ = behind); E ends the turn. */
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
  if (!active || active.isBot) { toast("Hold on, it isn't your turn yet."); return; }
  const room = active.position ? state.house[active.position] : null;
  if (!room) return;

  // Map-absolute: the key IS the compass direction, exactly as the minimap
  // draws it (↑ north, ↓ south, ← west, → east). Hero-relative keys were
  // tried and read inverted against the map whenever the hero faced south.
  const dir = which === "up" ? "north" : which === "down" ? "south" : which === "left" ? "west" : "east";

  const legal = DH.legalMoves(state, active.id);
  if (legal.doors.includes(dir)) { e.preventDefault(); act({ type: "explore", playerId: active.id, door: dir }); return; }
  const nKey = DH.neighborKey(room.floor, room.x, room.y, dir);
  if (legal.explored.includes(nKey)) { e.preventDefault(); act({ type: "move-to", playerId: active.id, toKey: nKey }); return; }
  // Vertical fallback: stairs and the elevator have no compass direction, so
  // "up"/"down" (ahead of / behind the hero) also ascend/descend to a
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
  toast(state.movementLeft <= 0 ? "No movement left. Press E to end your turn." : "No way through there.");
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
    // roomKeys is an array (walls/trim bound ONE room; doorway pieces carry
    // both neighbours) — same contract as the React client's XrayData.
    wall.userData.xray = {
      until: 0,
      roomKeys: [room.key],
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
        o.userData.xray = { until: 0, roomKeys: [room.key], normal: new THREE.Vector3(), box };
        byMat.set(o.material, o);
        trimMats.push(o.material);
      }
    });
    walls.push(...byMat.values());
  }
  return { group: g, key: room.key, floor, floorMat, labelEl: el, accent, accentBase, decor: decorG, walls, trimMats, culled: false, accentOn: true };
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

// Late-game performance: rooms deep in the fog drop their decor and candle
// entirely (the floor/walls/label silhouette survives), and at most
// MAX_ACCENT_LIGHTS accent PointLights stay on. Both use hysteresis — a
// light-count change recompiles shaders, so border rooms must not flip-flop.
const CULL_HIDE = 0.2; // decor + accent go dark below this litFactor…
const CULL_SHOW = 0.24; // …and only come back at this
const MAX_ACCENT_LIGHTS = 10;

/** Sync the house: build new rooms once, then refresh highlight + fog-of-war. */
function buildHouse(legal) {
  const hi = new Set(legal.explored);
  const vis = visibilityLevels();
  const lightRank = []; // visible-accent candidates for the light budget
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
    // Fog-of-war culling (hysteresis): deep-fog rooms shed their decor group
    // and accent light; floor, walls and label keep the dollhouse silhouette
    // (walls stay in the x-ray registry).
    entry.culled = entry.culled ? f < CULL_SHOW : f < CULL_HIDE;
    entry.decor.visible = !entry.culled;
    if (entry.culled) {
      entry.accentOn = false;
      entry.accent.visible = false;
    } else {
      // Sticky score: a light already on outranks a cold one at equal factor.
      entry.lightScore = f + (entry.accentOn ? 0.03 : 0);
      lightRank.push(entry);
    }
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
  // Light budget: keep the brightest ~10 accent lights, disable the rest
  // outright. Stable ordering (score desc, then room key) + the sticky score
  // above stop equal-factor rooms from trading places every rebuild.
  lightRank.sort((a, b) => (b.lightScore - a.lightScore) || (a.key < b.key ? -1 : 1));
  for (let i = 0; i < lightRank.length; i++) {
    const e = lightRank[i];
    e.accentOn = i < MAX_ACCENT_LIGHTS;
    e.accent.visible = e.accentOn;
  }
  // Doors first: a door is born in the same pass its far room lands, and its
  // stubs/header must join THIS rebuild of the registry, not the next one.
  syncDoors();
  // Keep the flat x-ray registry in step with both caches (self-heals across
  // rebuilds and new games — a size change is the only way rooms/doors appear).
  // doorsByRoom indexes each door's pieces under BOTH adjacent room keys so
  // pass B can ghost the followed room's doors without scanning every door.
  if (roomCache.size + doorCache.size !== xrayUnitCount) {
    xrayUnitCount = roomCache.size + doorCache.size;
    xrayWalls.length = 0;
    doorsByRoom.clear();
    for (const e of roomCache.values()) if (e.walls) xrayWalls.push(...e.walls);
    for (const e of doorCache.values()) if (e.walls) {
      xrayWalls.push(...e.walls);
      for (const k of e.rooms ?? []) {
        const list = doorsByRoom.get(k);
        if (list) list.push(...e.walls);
        else doorsByRoom.set(k, [...e.walls]);
      }
    }
  }
}

// ---- doors ----------------------------------------------------------------
// A door is built once at each *real* passage — a boundary where two placed
// rooms each have a matching doorway. A doorway that still opens onto the
// unknown stays a bare gap (marked by the flame arrow) until it's explored;
// the door springs into being the moment the new room is placed beyond it.
const DOOR_MAX_SWING = Math.PI * 0.56;

function buildDoorEntry(pos, rotated, keyA, keyB) {
  const g = new THREE.Group();
  g.position.copy(pos);
  if (rotated) g.rotation.y = Math.PI / 2; // east/west boundary: opening runs along z

  const H = TILE / 2;
  const DW = 2.4; // door opening width — human-scale absolute (the rest of the wall is stub)
  const DHt = 2.6; // door height — grand but human, leaving a real header under the wall top
  const WT = 0.22; // wall/door-wall thickness
  const LT = 0.12; // leaf thickness
  // One material PER mesh — EVERY doorway piece joins the x-ray pass, whose
  // fade writes per-mesh opacity and must never leak to a sibling piece.
  const wallMatFor = () => new THREE.MeshStandardMaterial({ color: 0x241b14, roughness: 1 });
  const frameMatFor = () => new THREE.MeshStandardMaterial({ color: 0x2c2016, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a3422, roughness: 0.82, metalness: 0.04 });

  // Stubs of dividing wall either side of the opening, and a header above it, so
  // the boundary reads as a solid wall with a doorway cut into it. The chase cam
  // puts this boundary square between camera and hero at every room crossing,
  // so the WHOLE assembly ghosts like room walls do — a closed leaf used to be
  // the one opaque slab left standing between the camera and a character.
  const xwalls = []; // stubs + header: own precise boxes
  const portalPieces = []; // jambs + leaf + panels + knob: one shared "portal" box
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
    const post = new THREE.Mesh(postGeo, frameMatFor());
    post.position.set(sx * (DW / 2), DHt / 2, 0);
    post.castShadow = true;
    portalPieces.push(post);
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
  portalPieces.push(leaf);
  pivot.add(leaf);
  // two recessed panels for a little relief
  for (const py of [leafH * 0.28, leafH * 0.68]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(leafW * 0.6, leafH * 0.26, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.9 }),
    );
    panel.position.set(leafW / 2, py, LT / 2);
    portalPieces.push(panel);
    pivot.add(panel);
  }
  // brass knob near the free edge
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xc8a23a, metalness: 0.75, roughness: 0.3 }),
  );
  knob.position.set(leafW - 0.18, leafH * 0.5, LT / 2 + 0.03);
  portalPieces.push(knob);
  pivot.add(knob);

  g.add(pivot);
  doorGroup.add(g);
  // World boxes need the group's final placement — same pattern as
  // buildRoomGroup: one matrix update after attach settles them for good.
  // Every piece carries BOTH adjacent room keys and a zero normal (pass B's
  // facing test is skipped), so the followed room's boundary ghosts door-and-
  // all. Jambs and every leaf piece share ONE portal box spanning the whole
  // opening — local center [0, DHt/2, 0], size [DW+0.2, DHt+0.06, WT+0.2],
  // mapped through the door's rotation and computed once at the closed pose
  // (the swing is brief; a slightly stale box only over-fades).
  g.updateMatrixWorld(true);
  for (const w of xwalls) {
    w.userData.xray = { until: 0, roomKeys: [keyA, keyB], normal: new THREE.Vector3(), box: new THREE.Box3().setFromObject(w) };
  }
  const portalBox = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(pos.x, pos.y + DHt / 2, pos.z),
    new THREE.Vector3(rotated ? WT + 0.2 : DW + 0.2, DHt + 0.06, rotated ? DW + 0.2 : WT + 0.2),
  );
  for (const w of portalPieces) {
    w.userData.xray = { until: 0, roomKeys: [keyA, keyB], normal: new THREE.Vector3(), box: portalBox };
  }
  xwalls.push(...portalPieces);
  return { group: g, pivot, open: 0, openTarget: 0, closeAt: 0, walls: xwalls, rooms: [keyA, keyB] };
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
      doorCache.set(bid, buildDoorEntry(pos, d === "east" || d === "west", room.key, nKey));
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
  // Retire the token's mixer + life layer from the per-frame update list —
  // otherwise they keep animating a detached skeleton forever.
  const ud = tok.group.userData;
  for (const m of [ud.anim?.mixer, ud.life]) {
    const i = m ? tokenAvatarMixers.indexOf(m) : -1;
    if (i >= 0) tokenAvatarMixers.splice(i, 1);
  }
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
  // A wound reads on the body too: negative deltas flinch. Walkers skip — the
  // stride owns the legs; the floating badge still tells the story.
  if (d < 0 && !tok.walking && !tok.path) playOneShot(tok, "hit");
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

// ---- character motion (weighted walk / lean / gaze / idle variety) --------
// All constants mirror the React client so both frontends move identically.
const WALK_RAMP_IN = 0.45; // u — speed smoothsteps up over the first stretch
const WALK_RAMP_OUT = 0.6; // u — and brakes over the last
const WALK_PACE_FLOOR = 0.25; // never slower — arrival must always land
const LEAN_PER_YAWRATE = 0.12; // body bank into a turn: -yawRate * this
const LEAN_MAX = 0.09; // rad — a lean, not a capsize
const LEAN_EASE = 8; // /s
const GAZE_WALKER_R2 = 12 * 12; // a walker within 12u (same floor) draws eyes
const GAZE_CHEST_Y = 1.2; // look at chests, not ankles
const GAZE_LOOK_MIN = 3, GAZE_LOOK_VAR = 3; // dwell on a roommate 3–6s…
const GAZE_REST_MIN = 2, GAZE_REST_VAR = 2; // …then look away 2–4s
const IDLE_SWAP_MIN = 9, IDLE_SWAP_VAR = 7; // fidget check every 9–16s…
const IDLE_SWAP_CHANCE = 0.35; // …35% chance to swap Idle ⇄ Idle_Neutral
const IDLE_SWAP_FADE = 0.6;
const _gazePoint = new THREE.Vector3(); // scratch — setGaze copies it
const _tokList = []; // per-frame token snapshot (gaze scans are O(n²), n ≤ ~10)

/** Clamped smoothstep of x into [0,1] — the walk envelope's easing brick. */
function smooth01(x) {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/** Is this token visibly covering ground right now (walk or glide)? */
function tokenMoving(tok) {
  return !!tok.path || (tok.kind === "p" ? !!tok.walking : tok.group.position.distanceToSquared(tok.target) > 4e-4);
}

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
  if (!from || !to || hop > 1) { tok.path = null; tok.travelDir = null; return; } // jumps/floors: facing falls back to body yaw
  const cont = !!(tok.path && tok.path.length); // mid-walk: extend, don't restart
  const path = cont ? tok.path : [];
  const start = cont ? path[path.length - 1] : tok.group.position;
  if (hop === 1) {
    // The hero's logical facing after this hop — feeds hero-relative keys.
    tok.travelDir = to.x > from.x ? "east" : to.x < from.x ? "west" : to.y > from.y ? "south" : "north";
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
  if (rem > TILE * 3) { tok.path = null; return; }
  // Weighted-walk bookkeeping: total journey length feeds the speed envelope
  // (ramp over the first stretch, brake over the last). An extended mid-walk
  // path keeps its distance-covered so the pace doesn't re-ramp from a stand.
  tok.walkDone = cont ? tok.walkDone || 0 : 0;
  tok.walkTotal = tok.walkDone + rem;
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
          // First frame of death: the body falls where it stood and stays —
          // upright (any mid-walk lean zeroes out; the fall owns the pose).
          tok.dead = true;
          tok.lean = 0;
          if (tok.group.userData.avatar) tok.group.userData.avatar.rotation.z = 0;
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
        tok.el.textContent = `${o.m.name}${o.m.attackType === "mental" ? " ✦" : ""} · ${o.m.hp}♥${atk ? " · strike" : ""}`;
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
// MINIMAP — a clickable 2D floor plan, bottom-right. One floor at a time
// (B/G/U tabs, auto-following the watched explorer), rooms as rounded squares
// with doorway notches, reachable rooms highlighted on your turn, aura and
// stairs/elevator glyphs, identity-coloured explorer dots (watched ringed)
// and red monster dots. Redrawn on state change (from render()), never per
// frame. Clicking a reachable room dispatches the SAME move as a 3D click.
// =========================================================================
const MM_TABS = [["basement", "B"], ["ground", "G"], ["upper", "U"]];
const MM_FLOOR_TITLE = { basement: "Basement", ground: "Ground floor", upper: "Upper floor" };
// dots: playerId -> {x,y} canvas position of that player's dot on the SHOWN
// floor (drives the .mm-you DOM pin and the locate-flash ring).
const mm = { floor: "ground", followFloor: null, cell: 0, rooms: [], legal: null, dots: new Map() };

/** Whose experience the minimap frames: the solo human, else the active
 *  hotseat human, else the first human at the table. */
function watchedPlayer() {
  const humans = state.players.filter((p) => !p.isBot);
  if (humans.length === 1) return humans[0];
  const a = state.players.find((p) => p.id === state.activePlayerId);
  return a && !a.isBot ? a : humans[0] ?? a ?? null;
}

function mmGlyph(special) {
  if (special === "mystic-elevator") return "⇅";
  if (special === "grand-staircase" || special === "stairs-up" || special === "stairs-down") return "⇗";
  return null;
}

function drawMinimap(legal) {
  const canvas = $("minimap-canvas");
  if (!canvas || !state) return;
  mm.legal = legal;

  // Auto-follow: the map switches floors with the watched explorer.
  const w = watchedPlayer();
  const wFloor = w?.position ? DH.parseKey(w.position).floor : null;
  if (wFloor && wFloor !== mm.followFloor) { mm.followFloor = wFloor; mm.floor = wFloor; }

  // Header strip: WHERE the watched explorer is (always current), then WHOSE
  // move it is — "Your move" in amber, or "<Name> is exploring…" dimmed.
  const activeP = state.players.find((p) => p.id === state.activePlayerId);
  const yourTurn = !!w && w.id === state.activePlayerId && !w.isBot &&
    (state.phase === "explore" || state.phase === "haunt");
  const hereEl = $("mm-here");
  if (hereEl) {
    const wRoom = w?.position ? state.house[w.position] : null;
    const wDef = wRoom ? DH.ROOMS_BY_ID[wRoom.roomId] : null;
    hereEl.textContent = wDef ? `⌖ ${wDef.name} · ${MM_FLOOR_TITLE[wRoom.floor]}` : "⌖ …";
  }
  const turnEl = $("mm-turn");
  if (turnEl) {
    turnEl.textContent = yourTurn ? "Your move" : `${activeP?.name ?? "…"} is exploring…`;
    turnEl.classList.toggle("yours", yourTurn);
  }

  // Floor tabs: letter + up to four occupancy dots (player colours) so "who
  // is on which floor" reads without switching; the watched player's floor
  // tab carries an amber ⌖ when it isn't the one shown.
  const tabs = $("minimap-floors");
  const byFloor = { basement: [], ground: [], upper: [] };
  for (const p of state.players) {
    if (!p.alive || !p.position) continue;
    const f = DH.parseKey(p.position).floor;
    const c = p.characterId ? DH.CHARACTERS_BY_ID[p.characterId] : null;
    if (byFloor[f] && byFloor[f].length < 4) byFloor[f].push(c?.color ?? "#888");
  }
  tabs.innerHTML = MM_TABS.map(([f, l]) =>
    `<button class="mm-tab${mm.floor === f ? " sel" : ""}" data-f="${f}" title="${MM_FLOOR_TITLE[f]}" aria-label="${MM_FLOOR_TITLE[f]}">` +
    `<span class="mm-tab-l">${l}${wFloor === f && mm.floor !== f ? '<span class="mm-tab-mark">⌖</span>' : ""}</span>` +
    `<span class="mm-tab-dots">${byFloor[f].map((c) => `<i style="background:${c}"></i>`).join("")}</span>` +
    `</button>`).join("");
  for (const b of tabs.querySelectorAll(".mm-tab")) {
    b.onclick = () => { mm.floor = b.dataset.f; drawMinimap(mm.legal); };
  }

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 216, H = canvas.clientHeight || 216;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  mm.rooms = [];
  mm.dots.clear();
  const youEl = $("mm-you");
  if (youEl) youEl.style.display = "none"; // re-shown below if your dot lands

  // Compass: ↑ key = north = map-up, tied together in the corner.
  g.strokeStyle = "rgba(216,207,196,.5)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(8, 9); g.lineTo(11, 4); g.lineTo(14, 9);
  g.stroke();
  g.fillStyle = "rgba(216,207,196,.55)";
  g.font = "9px Georgia,serif";
  g.textAlign = "center"; g.textBaseline = "top";
  g.fillText("N", 11, 11);

  const rooms = Object.values(state.house).filter((r) => r.floor === mm.floor);
  if (!rooms.length) {
    g.fillStyle = "rgba(138,128,118,.75)";
    g.font = "italic 12px Georgia,serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("unexplored", W / 2, H / 2);
    return;
  }

  // North-up auto-fit: grid north is y−1, which already draws upward.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x);
    minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y);
  }
  const cols = maxX - minX + 1, rows = maxY - minY + 1;
  const pad = 8;
  const cell = Math.min(34, (W - pad * 2) / cols, (H - pad * 2) / rows);
  const ox = (W - cell * cols) / 2, oy = (H - cell * rows) / 2;
  mm.cell = cell;

  // Reachable rooms only light on the watched human's own turn — the same
  // set the 3D view marks as walkable (legal.explored, for the active player).
  const reach = yourTurn ? new Set(legal.explored) : new Set();

  // Ink language: room-ink fill, bone walls, amber invitation. Door gaps at
  // 0.4·cell so openings read at a glance.
  const inset = 1.5, gapK = 0.4;
  for (const r of rooms) {
    const x0 = ox + (r.x - minX) * cell, y0 = oy + (r.y - minY) * cell;
    const def = DH.ROOMS_BY_ID[r.roomId];
    const reachable = reach.has(r.key);
    mm.rooms.push({ key: r.key, x0, y0, name: def?.name ?? "Room", reachable });

    const x1 = x0 + inset, y1 = y0 + inset, x2 = x0 + cell - inset, y2 = y0 + cell - inset;
    g.beginPath();
    g.roundRect(x1, y1, x2 - x1, y2 - y1, Math.max(2, cell * 0.14));
    g.fillStyle = reachable ? "rgba(232,168,90,.28)" : "#1d1826";
    g.fill();

    // Doorway edges are notched open; solid walls draw through. Reachable
    // rooms stroke amber with a soft glow (shadowBlur set for those only).
    const doors = DH.placedDoorways(r);
    g.lineWidth = 2;
    if (reachable) {
      g.strokeStyle = "#e8a85a";
      g.shadowColor = "rgba(232,168,90,.85)";
      g.shadowBlur = 6;
    } else {
      g.strokeStyle = "rgba(216,207,196,.85)";
    }
    const rr = Math.max(2, cell * 0.14);
    for (const [d, ax, ay, bx, by] of [
      ["north", x1 + rr, y1, x2 - rr, y1],
      ["south", x1 + rr, y2, x2 - rr, y2],
      ["west", x1, y1 + rr, x1, y2 - rr],
      ["east", x2, y1 + rr, x2, y2 - rr],
    ]) {
      g.beginPath();
      if (doors.has(d)) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const ux = (bx - ax) / len, uy = (by - ay) / len;
        const gp = (cell * gapK) / 2;
        g.moveTo(ax, ay); g.lineTo(mx - ux * gp, my - uy * gp);
        g.moveTo(mx + ux * gp, my + uy * gp); g.lineTo(bx, by);
      } else {
        g.moveTo(ax, ay); g.lineTo(bx, by);
      }
      g.stroke();
    }
    g.shadowBlur = 0;

    // The watched player's CURRENT room: an extra bone stroke, so "where am
    // I" has a room-level answer before you even spot your pin.
    if (w && w.position === r.key) {
      g.lineWidth = 2.5;
      g.strokeStyle = "rgba(233,223,204,.95)";
      g.beginPath();
      g.roundRect(x1 - 1, y1 - 1, x2 - x1 + 2, y2 - y1 + 2, Math.max(2, cell * 0.14));
      g.stroke();
    }

    // Stairs / elevator glyph, centered and faint under the occupant dots.
    const glyph = mmGlyph(def?.special);
    if (glyph) {
      g.fillStyle = "rgba(232,168,90,.9)";
      g.font = `${Math.max(9, cell * 0.42)}px Georgia,serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(glyph, x0 + cell / 2, y0 + cell / 2);
    }
    // Aura mark in the corner: blessed ✦ gold, cursed ☓ red.
    if (def?.aura) {
      g.fillStyle = def.aura > 0 ? "#e8ca62" : "#d0503c";
      g.font = `${Math.max(7, cell * 0.28)}px Georgia,serif`;
      g.textAlign = "left"; g.textBaseline = "top";
      g.fillText(def.aura > 0 ? "✦" : "☓", x1 + 1.5, y1 + 1);
    }
  }

  // Occupants: explorer dots in identity colours (with the character's
  // initial when the cells are large enough), monsters in threat red.
  // Multiple occupants fan out on a small ring.
  const occ = {};
  for (const p of state.players) if (p.position) (occ[p.position] ??= []).push({ kind: "p", p });
  for (const mn of state.haunt?.monsters ?? []) if (mn.hp > 0 && mn.position) (occ[mn.position] ??= []).push({ kind: "m" });
  const rad = Math.max(4.5, cell * 0.16);
  for (const rm of mm.rooms) {
    const list = occ[rm.key];
    if (!list) continue;
    list.forEach((o, i) => {
      const [dx, dz] = ring(i, list.length, cell * 0.2);
      const cx = rm.x0 + cell / 2 + dx, cy = rm.y0 + cell / 2 + dz;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      let c = null;
      if (o.kind === "m") g.fillStyle = "#c2412f";
      else {
        c = o.p.characterId ? DH.CHARACTERS_BY_ID[o.p.characterId] : null;
        g.fillStyle = o.p.alive ? (c?.color ?? "#888") : "#4a4440";
      }
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = "rgba(0,0,0,.65)";
      g.stroke();
      if (o.kind === "p") {
        mm.dots.set(o.p.id, { x: cx, y: cy });
        if (cell >= 22 && c && o.p.alive) {
          g.fillStyle = "#14111c";
          g.font = "bold 9px Georgia,serif";
          g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText(c.name.charAt(0), cx, cy + 0.5);
        }
      }
    });
  }

  // YOU-pin: a DOM ring in your character's colour with a pulsing amber halo
  // (pure CSS), positioned from this draw's mapping — hidden when the map is
  // showing another floor (the ⌖ on your floor's tab points the way back).
  if (youEl && w && w.alive) {
    const dot = mm.dots.get(w.id);
    if (dot) {
      const c = w.characterId ? DH.CHARACTERS_BY_ID[w.characterId] : null;
      youEl.style.display = "block";
      youEl.style.left = `${canvas.offsetLeft + dot.x}px`;
      youEl.style.top = `${canvas.offsetTop + dot.y}px`;
      youEl.style.setProperty("--yc", c?.color ?? "#e8a85a");
    }
  }
}

/** Locate-flash: jump the map to `playerId`'s floor and drop a temporary
 *  expanding ring over their dot (~1.8s, CSS keyframe). Roster clicks use it. */
function flashOnMap(playerId) {
  if (!state) return;
  const p = state.players.find((q) => q.id === playerId);
  if (!p || !p.position) return;
  mm.floor = DH.parseKey(p.position).floor;
  if (mm.legal) drawMinimap(mm.legal);
  const dot = mm.dots.get(playerId);
  const panel = $("minimap");
  const canvas = $("minimap-canvas");
  if (!dot || !panel || !canvas) return;
  const ring = document.createElement("div");
  ring.className = "mm-flash";
  ring.style.left = `${canvas.offsetLeft + dot.x}px`;
  ring.style.top = `${canvas.offsetTop + dot.y}px`;
  panel.appendChild(ring);
  setTimeout(() => ring.remove(), 1800);
}
window.__mmFlash = flashOnMap;

// Minimap interactions — bound once (the canvas lives in the static template).
if ($("minimap-canvas")) {
  const canvas = $("minimap-canvas");
  const tip = $("minimap-tip");
  const roomAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    return mm.rooms.find((r) => x >= r.x0 && x < r.x0 + mm.cell && y >= r.y0 && y < r.y0 + mm.cell) ?? null;
  };
  canvas.addEventListener("pointermove", (e) => {
    const r = roomAt(e);
    canvas.style.cursor = r && r.reachable ? "pointer" : "default";
    if (r) {
      const prect = canvas.parentElement.getBoundingClientRect();
      tip.textContent = r.name;
      tip.style.left = `${e.clientX - prect.left}px`;
      tip.style.top = `${e.clientY - prect.top}px`;
      tip.classList.add("show");
    } else tip.classList.remove("show");
  });
  canvas.addEventListener("pointerleave", () => tip.classList.remove("show"));
  canvas.addEventListener("pointerdown", (e) => {
    if (!state || state.phase === "ended" || !Beats.idle()) return;
    const r = roomAt(e);
    // The SAME dispatch as clicking the lit 3D floor; anything else no-ops.
    if (r && r.reachable) act({ type: "move-to", playerId: state.activePlayerId, toKey: r.key });
  });
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
  reactToAction(action); // before dispatch: a losing swing gets replaced by the flinch
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
    reactToAction(bot.action);
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
// END-TURN AUTO-ADVANCE — when there is for sure nothing left to do, the End
// turn button shines (et-pulse) with a 5s draining bar (et-timer/et-drain);
// if the player still hasn't clicked when it empties, the turn ends itself.
// Armed/disarmed from updateHUD (which runs after every dispatch); the arm
// timestamp is stable across HUD rebuilds so the bar never restarts. Bots
// never arm it — their driver ends turns on its own.
// =========================================================================
let autoEndArmedAt = 0; // performance.now() when armed; 0 = disarmed
let autoEndPid = null; // whose exhausted turn the countdown belongs to
let autoEndTimer = null;

/** Strictly nothing remains for the ACTIVE HUMAN this turn (recomputed fresh —
 *  used both when arming and again at fire time). */
function autoEndEligible() {
  if (!state || (state.phase !== "explore" && state.phase !== "haunt")) return false;
  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (!active || active.isBot) return false;
  // The haunt-reveal overlay is modal: never count down behind it.
  if (state.haunt && state.phase === "haunt" && lastHauntShown !== state.haunt.id) return false;
  return DH.legalMoves(state, active.id).nothingLeft;
}
function disarmAutoEnd() {
  autoEndArmedAt = 0;
  autoEndPid = null;
  if (autoEndTimer) { clearTimeout(autoEndTimer); autoEndTimer = null; }
}
function fireAutoEnd() {
  autoEndTimer = null;
  if (!autoEndArmedAt) return;
  if (!autoEndEligible()) { disarmAutoEnd(); return; }
  // A modal is up right now: postpone, don't cancel — the shine state is
  // re-evaluated on every render anyway.
  if (!Beats.idle()) { autoEndTimer = setTimeout(fireAutoEnd, AUTO_END_RETRY_MS); return; }
  const pid = state.activePlayerId;
  disarmAutoEnd();
  act({ type: "end-turn", playerId: pid });
}

// =========================================================================
// RENDER (state -> scene + HUD)
// =========================================================================
function render() {
  // Tint the whole scene with dread once the house has turned.
  document.body.classList.toggle("haunting", state.phase === "haunt");
  // The score follows the game's arc: exploration, the turn, the aftermath.
  Sound.setScene(state.phase === "ended" ? "ended" : state.phase === "haunt" ? "haunt" : "explore");
  const me = state.activePlayerId;
  const legal = me ? DH.legalMoves(state, me) : { explored: [], doors: [], attackMonsters: [], attackPlayers: [], pickupItems: [], tradePartners: [] };
  buildHouse(legal);
  syncTokens(legal);
  buildArrows(legal);
  drawMinimap(legal);
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
  "heal-might": "Steadies your nerve: +1 Might the first time it's found.",
  "heal-sanity": "A small mercy: +1 Sanity the first time it's found.",
  "drain-speed": "The air drags like syrup: −1 Speed the first time it's found.",
  pit: "A hidden drop in the dark: −1 Might the first time it's found.",
  vault: "A sealed vault. Loot it if you carry the Iron Key.",
  "draw-extra-omen": "It pulls the dark closer, drawing an extra Omen.",
  "mystic-elevator": "An iron cage that carries you between floors.",
  "grand-staircase": "Stairs up and down: change floors here.",
  "stairs-up": "Stairs up: change floors here.",
  "stairs-down": "Stairs down: change floors here.",
  "entrance-hall": "The front door. In some haunts you escape through here.",
};
function roomNotes(def) {
  const notes = [];
  if (def.aura > 0) notes.push(`✦ Blessed: +${def.aura} die to every roll while you're here.`);
  else if (def.aura < 0) notes.push(`☓ Cursed: ${def.aura} dice to every roll while you're here.`);
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
    ? `<span class="turn-chip"><span class="roster-avatar" style="--pc:${activeChar.color}">${activeChar.name.charAt(0)}${pface(activeChar.id)}</span> ${active.name}</span>`
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
    `${!ended ? (botActing ? ' <span class="muted">is taking their turn…</span>' : ' <span class="you-tag"> · your move</span>') : ""}</div>` +
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
    // Where-line: the room they stand in (dead explorers read "fallen"), and
    // the whole row is a button — click it to flash them on the minimap.
    const _proom = p.position ? state.house[p.position] : null;
    const where = !p.alive ? "fallen" : (_proom ? DH.ROOMS_BY_ID[_proom.roomId]?.name ?? "…" : "…");
    return `<button type="button" class="roster-row${state.activePlayerId === p.id ? " active" : ""}${!p.alive ? " dead" : ""}"` +
      ` onclick="window.__mmFlash('${p.id}')" aria-label="Show ${p.name} on the map" title="Show ${p.name} on the map">` +
      `<span class="roster-avatar" style="--pc:${c?.color ?? "#888"}">${p.alive ? (c?.name.charAt(0) ?? "?") + (c ? pface(c.id) : "") : "☠"}</span>` +
      `<span class="roster-id"><span class="roster-name">${p.name}${isMe ? " (you)" : ""}</span>` +
      `<span class="roster-where">· ${where}</span></span>` +
      traits +
      `${p.side === "traitor" ? '<span class="roster-traitor">☠</span>' : ""}</button>`;
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
      `<div class="tp-head" style="border-color:${c.color}"><div class="tp-avatar" style="--pc:${c.color}">${c.name.charAt(0)}${pface(c.id)}</div>` +
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

  // End-turn shine: the active human has strictly nothing left to do. Arm the
  // 5s auto-end once when the condition becomes true, keep the same arm
  // timestamp across re-renders (negative animation-delay resumes the bar and
  // pulse mid-flight), and disarm the moment it goes false.
  const hauntPending = !!state.haunt && state.phase === "haunt" && lastHauntShown !== state.haunt.id;
  const shineNow = !ended && !!active && !active.isBot && legal.nothingLeft && !hauntPending && Beats.idle();
  if (shineNow) {
    if (!autoEndArmedAt || autoEndPid !== active.id) {
      disarmAutoEnd();
      autoEndPid = active.id;
      autoEndArmedAt = performance.now();
      autoEndTimer = setTimeout(fireAutoEnd, AUTO_END_MS);
    }
  } else disarmAutoEnd();

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
    if (legal.canInvestigate) {
      bottom += `<button class="btn act" title="Costs 1 step · Knowledge roll vs 4: glimpse the next omen, or read a monster during the haunt" onclick="window.__act({type:'investigate',playerId:'${active.id}'})"><span class="bi">👁</span><span>Investigate</span></button>`;
    }
    if (legal.canRest) {
      bottom += `<button class="btn act" title="Ends your movement · recover +1 on your most-wounded trait" onclick="window.__act({type:'rest',playerId:'${active.id}'})"><span class="bi">✚</span><span>Steady</span></button>`;
    }
    const _broom = active.position ? state.house[active.position] : null;
    for (const dir of legal.barricadeDoors ?? []) {
      let label = dir;
      if (_broom) {
        const nKey = DH.neighborKey(_broom.floor, _broom.x, _broom.y, dir);
        const nDef = state.house[nKey] ? DH.ROOMS_BY_ID[state.house[nKey].roomId] : null;
        if (nDef) label = nDef.name;
      }
      bottom += `<button class="btn act" title="Costs 1 step · wedge this door shut for 3 rounds; nothing gets through either way" onclick="window.__act({type:'barricade',playerId:'${active.id}',door:'${dir}'})"><span class="bi">⛓</span><span>Barricade → ${label}</span></button>`;
    }
    const etAge = shineNow ? (performance.now() - autoEndArmedAt).toFixed(0) : "0";
    bottom += `<button class="btn primary${shineNow ? " shine" : ""}"${shineNow ? ` style="--dly:-${etAge}ms"` : ""} onclick="window.__act({type:'end-turn',playerId:'${active.id}'})"><span class="bi">🕯</span><span>End turn</span>${humans.length > 1 ? ' <span class="small muted">pass device</span>' : ""}${shineNow ? `<span class="et-timer" style="animation-duration:${AUTO_END_MS}ms;animation-delay:-${etAge}ms"></span>` : ""}</button>`;
  }
  $("hud-bottom").innerHTML = bottom;

  // overlays — the haunt reveal waits behind any queued cinematic beats (the
  // omen card that triggered it flips first, then the house turns).
  const ov = $("overlay");
  // Game over: the winners' bodies celebrate once, as the result card appears.
  if (ended && Beats.idle()) triggerCheers();
  if (haunt && state.haunt && state.phase === "haunt" && lastHauntShown !== state.haunt.id && Beats.idle()) {
    if (lastStinger !== state.haunt.id) {
      Sound.sting("reveal");
      lastStinger = state.haunt.id;
      triggerHauntStagger(); // the whole party reels as the house turns
    }
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
// ---- adaptive quality + idle throttle ------------------------------------
// Two independent cost governors (same constants as the React client):
//  1. DPR ladder — start at min(1.5, devicePixelRatio) and step DOWN a rung
//     while the rolling ACTIVE frame time sustains > 34ms; step back UP after
//     ~10s sustained < 20ms. Min 3s between steps; the gap between the two
//     thresholds plus the post-step re-warm-up is the hysteresis.
//  2. Idle throttle — a board game is static most of the time: when nothing
//     on screen is in motion (no walker, chase relaxed, no beat FX, camera
//     settled and untouched), GL rendering drops to ~24fps. A skipped tick
//     returns before touching the scene graph, and the next rendered frame
//     receives the real accumulated dt — every system below is dt-based, and
//     the world is static by definition on skipped frames, so nothing drifts
//     or stutters. DOM/CSS beats (card flip, timer bars, dice tray, auto-end)
//     and the WebAudio score live entirely outside this loop: unaffected.
const DPR_LADDER = [1.5, 1.25, 1.0, 0.8];
const PERF_STEP_DOWN_MS = 34, PERF_STEP_UP_MS = 20; // active frame-time thresholds
const PERF_STEP_COOLDOWN_MS = 3000, PERF_GOOD_HOLD_MS = 10000, PERF_WARMUP_FRAMES = 30;
const IDLE_FPS = 24, USER_CAM_HOLD_MS = 1500;
let dprIndex = 0; // current rung on DPR_LADDER
let perfAvg = 16.7, perfSamples = 0, perfGoodSince = 0, perfLastStep = 0;
let lastTickMs = 0, lastActiveTickMs = 0, idleAccumMs = 0, framesRendered = 0;
let camSettled = true, xraySettled = true, doorsSettled = true; // written by the rendered frame
let frozenPrev = false, frozenChangedAt = 0;
const camPrev = new THREE.Vector3(), lookPrev = new THREE.Vector3();

const currentDpr = () => Math.min(DPR_LADDER[dprIndex], window.devicePixelRatio || 1);

/** Rolling average of ACTIVE frame-to-frame time drives the DPR ladder.
 *  Throttled idle frames never sample — their interval is 24fps by design. */
function perfSample(frameMs, nowMs) {
  perfAvg += (frameMs - perfAvg) * 0.08; // EMA ≈ the last ~25 active frames
  perfSamples++;
  if (perfAvg >= PERF_STEP_UP_MS) perfGoodSince = 0;
  else if (!perfGoodSince) perfGoodSince = nowMs;
  if (perfSamples < PERF_WARMUP_FRAMES || nowMs - perfLastStep < PERF_STEP_COOLDOWN_MS) return;
  if (perfAvg > PERF_STEP_DOWN_MS && dprIndex < DPR_LADDER.length - 1) dprIndex++;
  else if (dprIndex > 0 && perfGoodSince && nowMs - perfGoodSince > PERF_GOOD_HOLD_MS) dprIndex--;
  else return;
  perfLastStep = nowMs;
  perfSamples = 0; // re-warm-up: let the new rung settle before judging again
  perfGoodSince = 0;
  onResize(); // reapplies pixelRatio + size (labelRenderer is pure CSS: no-op)
}

/** Is anything on screen in motion (or about to be)? Cheap flag reads only —
 *  this runs on every rAF tick, including the ones the throttle then skips. */
function sceneBusy(nowMs) {
  if (!state) return true;
  if (nowMs - userCamAt < USER_CAM_HOLD_MS) return true; // user drove the camera just now
  if (!camSettled) return true; // camera still visibly easing (or user mid-orbit)
  const frozen = Beats.freeze();
  if (frozen !== frozenPrev) { frozenPrev = frozen; frozenChangedAt = nowMs; }
  if (nowMs - frozenChangedAt < 600) return true; // freeze on/off transition settling
  // A modal freeze clamps dt to 0: the world is a HELD FRAME while the card
  // is read. Beat FX, walkers, chase eases, door swings and wall fades cannot
  // move an inch until it lifts — so none of them may hold full rate here.
  // (Reading a card is the single most common "static screen" in real play.)
  if (frozen) return false;
  if (chase > 0.01 || chaseWant !== 0) return true; // chase cam engaged / relaxing
  if (fxList.length) return true; // beat-FX pulses or embers alive
  if (nowMs < Beats.director.until) return true; // focus-pulse push-in
  if (followTarget.valid && followTarget.moving) return true; // active explorer striding
  for (const tok of tokenCache.values()) {
    if (tok.path || !tok.placed) return true; // waypoint walk in progress / spawn pending
    if (tok.group.position.distanceToSquared(tok.target) > 4e-4) return true; // gliding
    if (tok.group.userData.anim?.oneShot) return true; // one-shot reaction mid-play
  }
  if (!xraySettled || !doorsSettled) return true; // eases still landing
  return false;
}

function onResize() {
  if (!renderer) return;
  const wrap = $("canvas-wrap");
  const w = wrap.clientWidth, h = wrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // DPR discipline: capped at the governor's current rung (1.5 at boot) —
  // native 2x+ panels were paying 1.8-4x the fragment work for subpixel gains.
  renderer.setPixelRatio(currentDpr());
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  const tickMs = performance.now();
  const tickDt = lastTickMs ? tickMs - lastTickMs : 16.7;
  lastTickMs = tickMs;
  if (sceneBusy(tickMs)) {
    // ACTIVE: render this tick, and feed the DPR governor the true interval
    // between consecutive active rendered frames.
    if (lastActiveTickMs) perfSample(tickMs - lastActiveTickMs, tickMs);
    lastActiveTickMs = tickMs;
    idleAccumMs = 0;
  } else {
    lastActiveTickMs = 0;
    // QUIET: accumulate ticks and render at ~24fps. lastFrameT is only
    // advanced by rendered frames, so the skipped time flows into the next
    // frame's dt automatically (≈42ms, well under the 0.12 clamp).
    idleAccumMs += tickDt;
    if (idleAccumMs < 1000 / IDLE_FPS) return;
    idleAccumMs = Math.min(idleAccumMs - 1000 / IDLE_FPS, 34); // carry the remainder → a true 24fps average
  }
  framesRendered++;
  const now = tickMs / 1000;
  // Clamp at 0.12 (was 0.05): under heavy late-game frames a 0.05 cap made
  // game-time run at a fraction of wall-time — walking felt glacial exactly
  // when the scene was heaviest. Every easing below is an exp() form (stable
  // at any dt) and the walker consumes waypoints by distance, so 0.12 is safe.
  const rawDt = lastFrameT ? Math.min(0.12, now - lastFrameT) : 0.016;
  lastFrameT = now;
  // While a modal beat (card flip / death banner) is ON SCREEN, the WORLD
  // holds its breath: dt clamps to 0 so mixers, the waypoint walker, camera
  // easing, x-ray fades and particle beats all stand perfectly still — but
  // frames keep rendering (the frozen scene reads behind the lightened
  // backdrop) and DOM/CSS animations (flip, timer bar, dice tray) run on.
  // A beat still QUEUED (deferring on the walker) leaves time running, so
  // the walk visibly lands before its card freezes the frame. Because
  // everything below eases from its current value, nothing teleports.
  const frozen = Beats.freeze();
  const dt = frozen ? 0 : rawDt;
  animT += dt;
  const t = animT; // world clock — every time-driven flourish freezes with it
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

  if (dust && dt > 0) {
    const a = dust.geometry.getAttribute("position");
    const arr = a.array;
    for (let i = 0; i < arr.length; i += 3) { arr[i + 1] += 0.012; if (arr[i + 1] > 20) arr[i + 1] = -18; }
    a.needsUpdate = true;
    dust.rotation.y += 0.0006;
  }
  if (dt > 0) for (const l of wisps) {
    const b = l.userData.base;
    const seed = b[0] + b[2];
    let f = 1 + Math.sin(t * 23 + seed) * 0.1 + Math.sin(t * 7.3 + seed * 2.1) * 0.16 + Math.sin(t * 1.7 + seed * 0.7) * 0.06;
    if (Math.random() < 0.015) f *= 0.55;
    l.intensity = Math.max(8, 18 * f);
    l.position.set(b[0] + Math.sin(t * 0.5 + b[2]) * 1.75, b[1] + Math.sin(t * 0.7) * 0.4, b[2] + Math.cos(t * 0.4 + b[0]) * 1.75);
  }
  // Ease each token toward its target room/offset and turn it to face the way
  // it's travelling, so a move reads as walking rather than a teleport.
  // (Snapshot the registry once so the gaze pass can scan it allocation-free.)
  _tokList.length = 0;
  for (const tok of tokenCache.values()) _tokList.push(tok);
  for (let ti = 0; ti < _tokList.length; ti++) {
    const tok = _tokList[ti];
    const g = tok.group;
    if (!tok.placed) { g.position.copy(tok.target); tok.placed = true; tok.path = null; }
    const px = g.position.x, pz = g.position.z;
    if (tok.path) {
      // Waypoint walk: consume the planned ring/door points at WALK_SPEED
      // scaled by a distance-based envelope — smoothstep up over the first
      // WALK_RAMP_IN units of the journey, brake over the last WALK_RAMP_OUT,
      // floored so arrival always lands (deferred beats gate on tok.path).
      const remain = Math.max(0, (tok.walkTotal || 0) - (tok.walkDone || 0));
      const pace = Math.max(WALK_PACE_FLOOR, smooth01((tok.walkDone || 0) / WALK_RAMP_IN) * smooth01(remain / WALK_RAMP_OUT));
      let budget = WALK_SPEED * dt * pace;
      while (budget > 1e-5 && tok.path.length) {
        const w = tok.path[0];
        _walkV.subVectors(w, g.position);
        const dist = _walkV.length();
        if (dist <= budget) { g.position.copy(w); tok.path.shift(); budget -= dist; tok.walkDone += dist; }
        else { g.position.addScaledVector(_walkV.multiplyScalar(1 / dist), budget); tok.walkDone += budget; budget = 0; }
      }
      if (!tok.path.length) tok.path = null;
    } else {
      // Direct glide — floor changes and non-adjacent jumps (stairs, elevator,
      // falls). k = 4.5 × (4/7) ≈ 2.6 keeps peak world-speed matched to the
      // walk clip over a 7-unit hop (settles in ~1.15s).
      g.position.lerp(tok.target, 1 - Math.exp(-2.6 * dt));
    }
    const dx = g.position.x - px, dz = g.position.z - pz;
    let yawStep = 0;
    if (dx * dx + dz * dz > 1e-6) {
      const desired = Math.atan2(dx, dz);
      const d = ((desired - tok.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      yawStep = d * (1 - Math.exp(-12 * dt));
      tok.yaw += yawStep;
    }
    g.rotation.y = tok.yaw;
    // Feet match the glide: the rigged body strides while covering ground and
    // settles back to idle on arrival. The dead stay exactly as they fell.
    // (dt=0 = frozen frame: skip, so a mid-stride walker holds his pose
    // instead of reading zero speed and crossfading to idle behind the card.)
    if (tok.kind === "p" && !tok.dead && dt > 0) {
      const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(1e-4, dt);
      // Hysteresis so the clip can't flap right at the threshold.
      tok.walking = speed > (tok.walking ? 0.4 : 0.8);
      setAvatarClip(g, tok.walking ? "walk" : (tok.idleVariant || "idle"));
      // Turn lean: the body banks into the turn (yaw-rate scaled) and eases
      // back upright when the path straightens or the walk ends. On the model
      // child under the yaw-rotating group, so it tilts about the travel axis.
      const leanWant = Math.max(-LEAN_MAX, Math.min(LEAN_MAX, -(yawStep / dt) * LEAN_PER_YAWRATE));
      tok.lean = (tok.lean || 0) + (leanWant - (tok.lean || 0)) * (1 - Math.exp(-LEAN_EASE * dt));
      const mdl = g.userData.avatar;
      if (mdl) mdl.rotation.z = tok.lean;
      // Idle variety: a standing body occasionally shifts its weight — every
      // 9–16s a 35% chance to crossfade between the two idle stances.
      if (!tok.walking && !g.userData.anim?.oneShot) {
        if (tok.idleAt === undefined) tok.idleAt = t + IDLE_SWAP_MIN + Math.random() * IDLE_SWAP_VAR;
        else if (t >= tok.idleAt) {
          tok.idleAt = t + IDLE_SWAP_MIN + Math.random() * IDLE_SWAP_VAR;
          if (Math.random() < IDLE_SWAP_CHANCE) {
            tok.idleVariant = tok.idleVariant === "idle2" ? "idle" : "idle2";
            setAvatarClip(g, tok.idleVariant, IDLE_SWAP_FADE);
          }
        }
      }
      // Gaze targeting: idle explorers watch whoever is crossing the floor
      // nearby, else trade glances with a roommate (dwell, look away, repeat).
      // Walkers and the dead look at no one. Head motion is additive in the
      // life layer — deliberately NOT scene-busy (it reads fine at 24fps).
      const life = g.userData.life;
      if (life) {
        if (tok.walking || tok.path) {
          life.setGaze(null);
          tok.gazeUntil = 0;
          tok.gazeLook = false;
        } else {
          // a) a living token walking within 12u on this floor — the nearest.
          let watch = null, watchD = GAZE_WALKER_R2;
          for (let i = 0; i < _tokList.length; i++) {
            const o = _tokList[i];
            if (o === tok || o.dead || !tokenMoving(o)) continue;
            if (Math.abs(o.group.position.y - g.position.y) > 2) continue; // other floor
            const wx = o.group.position.x - g.position.x, wz = o.group.position.z - g.position.z;
            const d2 = wx * wx + wz * wz;
            if (d2 < watchD) { watchD = d2; watch = o; }
          }
          if (watch) {
            _gazePoint.copy(watch.group.position);
            _gazePoint.y += GAZE_CHEST_Y;
            life.setGaze(_gazePoint);
            tok.gazeUntil = 0; // company passed: the idle dwell restarts fresh
            tok.gazeLook = false;
          } else {
            // b) idle company: watch the nearest fellow explorer in this room
            //    for a while, look away for a while — per-token random timers.
            if (!tok.gazeUntil || t >= tok.gazeUntil) {
              tok.gazeLook = !tok.gazeLook;
              tok.gazeUntil = t + (tok.gazeLook
                ? GAZE_LOOK_MIN + Math.random() * GAZE_LOOK_VAR
                : GAZE_REST_MIN + Math.random() * GAZE_REST_VAR);
            }
            let mate = null, mateD = Infinity;
            if (tok.gazeLook) for (let i = 0; i < _tokList.length; i++) {
              const o = _tokList[i];
              if (o === tok || o.kind !== "p" || o.dead || o.lastKey !== tok.lastKey) continue;
              const wx = o.group.position.x - g.position.x, wz = o.group.position.z - g.position.z;
              const d2 = wx * wx + wz * wz;
              if (d2 < mateD) { mateD = d2; mate = o; }
            }
            if (mate) {
              _gazePoint.copy(mate.group.position);
              _gazePoint.y += GAZE_CHEST_Y;
              life.setGaze(_gazePoint);
            } else life.setGaze(null);
          }
        }
      }
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
  doorsSettled = true;
  for (const e of doorCache.values()) {
    if (e.openTarget === 1 && nowMs > e.closeAt) e.openTarget = 0;
    e.open += (e.openTarget - e.open) * (1 - Math.exp(-7 * dt));
    if (Math.abs(e.openTarget - e.open) > 0.005) doorsSettled = false; // mid-swing: hold full rate
    e.pivot.rotation.y = -e.open * DOOR_MAX_SWING;
  }

  // X-ray walls: any wall — including the WHOLE doorway assembly (stubs,
  // header, jambs, leaf, panels, knob) — between the camera and a living
  // character ghosts to 0.12, and the followed room's camera-facing walls
  // always do; smoothly, per-mesh. Wall-height decor trim and door pieces
  // carry a zero normal (facing test skipped), and door pieces carry both
  // adjacent room keys, so the followed room's boundary reads open door-and-
  // all from any orbit angle. Only furniture never fades.
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
    // B. the active player's room: its near-side walls ghost from any angle,
    //    and so does every doorway bounding the room (doorsByRoom index —
    //    door pieces have zero normals, so no facing test applies).
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
    if (aRoom) {
      const dws = doorsByRoom.get(aRoom.key);
      if (dws) for (const w of dws) w.userData.xray.until = nowMs + XRAY_HOLD_MS;
    }
    // C. fade application — the ONLY code allowed to touch wall opacity.
    xraySettled = true;
    for (const w of xrayWalls) {
      const m = w.material;
      const target = nowMs < w.userData.xray.until ? XRAY_OPACITY : 1;
      m.opacity += (target - m.opacity) * (1 - Math.exp(-(target < m.opacity ? 10 : 4) * dt));
      const solid = m.opacity > 0.985;
      m.transparent = !solid;
      m.depthWrite = solid; // opaque pass when fully solid: no sorting artifacts
      if (solid) m.opacity = 1;
      else if (Math.abs(target - m.opacity) > 0.004) xraySettled = false; // mid-fade: hold full rate
    }
  }

  // Camera truly at rest? Its exp-eases never *quite* land, so "settled" is
  // sub-millimeter motion since the last rendered frame — the catch-all that
  // keeps every dolly/orbit/push-in at full rate until it has visibly stopped.
  camSettled =
    camera.position.distanceToSquared(camPrev) < 1e-6 &&
    controls.target.distanceToSquared(lookPrev) < 1e-6;
  camPrev.copy(camera.position);
  lookPrev.copy(controls.target);

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
  wRenderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio)); // same DPR cap as the main view
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
    `<span class="bond-thread">●</span> <button class="bond-link" style="color:${bondTo.color}">${bondTo.name}</button> · ${c.bond.text}`;
  bondEl.querySelector(".bond-link").onclick = () => wardrobeShow(bondTo.id);
  $("w-traits").innerHTML = DH.TRAITS.map((t) => `<span class="trait-chip">${t.slice(0, 3)} ${c.traits[t].values[c.traits[t].start]}</span>`).join("");
  const inParty = party.some((p) => p.charId === charId);
  const btn = $("w-pick");
  btn.textContent = inParty ? "✓ In party · remove" : "Add to party";
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
// and force a re-render after mutating it. `perf` exposes the throttle and
// DPR-governor internals so headless runs can assert the idle savings.
// Harmless in normal play.
Object.defineProperty(window, "__dh", {
  value: {
    get state() { return state; },
    render: () => render(),
    /** Live token registry (entity id -> token) — headless probes assert gaze
     *  head-turns and reaction clips through it. Read-only by convention. */
    get tokens() { return tokenCache; },
    perf: {
      get frames() { return framesRendered; }, // GL frames actually rendered
      get avgMs() { return perfAvg; }, // rolling ACTIVE frame time (ms)
      get dpr() { return currentDpr(); },
      get rung() { return dprIndex; },
      get busy() { return renderer ? sceneBusy(performance.now()) : false; },
    },
  },
});

// boot
$("begin-btn").onclick = () => beginGame(false);
$("solo-btn").onclick = () => beginGame(true);
$("sound-btn").onclick = () => { if (!Sound.started) Sound.start(); else Sound.toggle(); syncSoundBtn(); };
syncSoundBtn();

// Autoplay unlock: the very first gesture anywhere starts the audio engine,
// so the score's lobby scene plays under character selection. (Begin/solo
// clicks still call Sound.start() themselves — whichever lands first wins.)
const _unlockAudio = () => {
  window.removeEventListener("pointerdown", _unlockAudio);
  window.removeEventListener("keydown", _unlockAudio);
  if (!Sound.started) { Sound.start(); syncSoundBtn(); }
};
window.addEventListener("pointerdown", _unlockAudio);
window.addEventListener("keydown", _unlockAudio);

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
