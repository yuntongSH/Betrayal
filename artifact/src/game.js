import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { buildRoomDecor, roomTheme, buildExplorerFigure, buildMonsterFigure, animateFigure, materials, surfaceFor } from "@dread-hollow/decor";

const DH = window.DH;
const $ = (id) => document.getElementById(id);

// ---- world layout (mirrors the React client) -----------------------------
const TILE = 4;
const WALL_H = 2.7;
const FLOOR_GAP = 7;
const FLOOR_Y = { basement: -FLOOR_GAP, ground: 0, upper: FLOOR_GAP };
const TRAIT_COLOR = { speed: "#d8b54a", might: "#c2412f", sanity: "#6fb6b5", knowledge: "#7a6db0" };

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
/** Load the avatar for `archetype` into `group` (feet at y=0, ~targetH tall),
 *  starting an idle clip whose mixer is pushed to `mixers`. Async — swaps in on
 *  load; returns true if a model exists for this archetype. */
function attachAvatar(group, archetype, targetH, mixers) {
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
        // share this body, then lerp gently toward the identity colour.
        if (entry.tint != null) {
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            if (m.color) m.color.lerp(new THREE.Color(entry.tint), 0.28);
          });
        }
      });
      // These bodies load in T-pose with no animation — drop the upper arms to a
      // relaxed stance so they read as a person standing, not a mannequin.
      if (entry.pose) {
        const la = model.getObjectByName("upperarm_l");
        const ra = model.getObjectByName("upperarm_r");
        if (la) la.rotation.z = -POSE_ARM;
        if (ra) ra.rotation.z = POSE_ARM;
      }
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
        const idle = gltf.animations.find((a) => /idle/i.test(a.name)) || gltf.animations[0];
        mixer.clipAction(idle).play();
        mixers.push(mixer);
      }
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
function ring(i, n, rad) { if (n <= 1) return [0, 0]; const a = (i / n) * Math.PI * 2; return [Math.cos(a) * rad, Math.sin(a) * rad]; }

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
const BOT_STEP_MS = 950;
const BOT_TURN_START_MS = 1350;
const party = []; // { pid, charId }

// ---- three.js objects ----------------------------------------------------
let scene, camera, renderer, labelRenderer, controls, raycaster, pointer;
let houseGroup, tokenGroup, arrowGroup, doorGroup;
let dust, wisps = [];
const tokenCache = new Map(); // entity id -> persistent token group (lerped toward its target)
let lastFrameT = 0;
const roomCache = new Map(); // key -> { group, floorMat, labelEl } built once per room
const doorCache = new Map(); // boundary id -> { group, pivot, open, openTarget, closeAt }
const camDesired = new THREE.Vector3(0, 0, 4); // soft camera-follow target
let userCamAt = 0; // performance.now() of the last manual orbit/zoom — pauses auto-follow
const camOffset = new THREE.Vector3(); // scratch for the cinematic dolly math

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
  scene.fog = new THREE.Fog(0x05050a, 9, 34);

  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
  camera.position.set(12, 14, 18);

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
  controls.target.set(0, 0, 4);
  controls.maxPolarAngle = 1.45;
  controls.minDistance = 6;
  controls.maxDistance = 60;
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
  moon.position.set(14, 28, 6);
  // The moon is the one shadow-casting key — without this the artifact rendered
  // ZERO shadows despite shadowMap.enabled, so nothing was grounded.
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 110;
  moon.shadow.camera.left = -45;
  moon.shadow.camera.right = 45;
  moon.shadow.camera.top = 45;
  moon.shadow.camera.bottom = -45;
  scene.add(moon);

  // dust
  const N = 300;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 44;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 44 + 4;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.045, color: 0xb8a888, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  scene.add(dust);

  // wandering candle-wisps
  for (const base of [[0, 1.4, 0], [-2, 1.2, 6], [3, 1.6, 3]]) {
    const l = new THREE.PointLight(0xe8975a, 18, 10, 2);
    l.position.set(base[0], base[1], base[2]);
    l.userData.base = base;
    scene.add(l);
    wisps.push(l);
  }

  // void
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 1 }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, -FLOOR_GAP - 2, 4);
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
  if (!state || (state.phase !== "explore" && state.phase !== "haunt")) return;
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

  const wallMat = surf.wall === "wallpaper"
    ? materials.peelingWallpaper({ tint: theme.wall })
    : surf.wall === "stone"
      ? materials.crackedStone({ tint: theme.wall })
      : materials.stainedPlaster({ tint: theme.wall });

  const doors = DH.placedDoorways(room);
  const H = TILE / 2;
  for (const d of DIRS) {
    if (doors.has(d)) continue;
    const wall = new THREE.Mesh(
      (d === "north" || d === "south") ? new THREE.BoxGeometry(TILE, WALL_H, 0.2) : new THREE.BoxGeometry(0.2, WALL_H, TILE),
      wallMat,
    );
    wall.position.set(d === "east" ? H : d === "west" ? -H : 0, WALL_H / 2, d === "south" ? H : d === "north" ? -H : 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
  }

  g.add(buildRoomDecor(room.roomId, TILE));

  const accentBase = theme.accentIntensity * 7;
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
  return { group: g, floor, floorMat, labelEl: el, accent, accentBase };
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
    entry.labelEl.className = "lbl3d" + (lit ? " lit" : "") + (f < 0.2 ? " faint" : "");
  }
  syncDoors();
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
  const DW = TILE * 0.44; // door opening width (the rest of the wall is stub)
  const DHt = WALL_H * 0.92; // door height
  const WT = 0.22; // wall/door-wall thickness
  const LT = 0.12; // leaf thickness
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x241b14, roughness: 1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c2016, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a3422, roughness: 0.82, metalness: 0.04 });

  // Stubs of dividing wall either side of the opening, and a header above it, so
  // the boundary reads as a solid wall with a doorway cut into it.
  const stubW = H - DW / 2;
  for (const sx of [-1, 1]) {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(stubW, WALL_H, WT), wallMat);
    stub.position.set(sx * (DW / 2 + stubW / 2), WALL_H / 2, 0);
    stub.castShadow = true; stub.receiveShadow = true;
    g.add(stub);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(DW, WALL_H - DHt, WT), wallMat);
  header.position.set(0, (DHt + WALL_H) / 2, 0);
  header.castShadow = true; header.receiveShadow = true;
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
  return { group: g, pivot, open: 0, openTarget: 0, closeAt: 0 };
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

  const beamLight = new THREE.PointLight(0xe8a85a, 5, 4, 2);
  beamLight.position.y = 1.6;
  beamLight.visible = false;
  g.add(beamLight);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.5, 3.2, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe8a85a, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  beam.position.y = 1.6;
  beam.visible = false;
  g.add(beam);
  const traitorLight = new THREE.PointLight(0xc2412f, 4, 3, 2);
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
  const light = new THREE.PointLight(0xc2412f, 2.5, 4, 2);
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

// Reconcile the persistent token set against the current state: create new
// tokens, retire vanished ones, and update each token's TARGET (the animate
// loop eases the actual position toward it, so movement reads as travel).
function syncTokens(legal) {
  const byKey = {};
  for (const p of state.players) if (p.alive && p.position) (byKey[p.position] ??= []).push({ kind: "p", id: p.id, p });
  for (const m of state.haunt?.monsters ?? []) if (m.hp > 0 && m.position) (byKey[m.position] ??= []).push({ kind: "m", id: m.id, m });

  const attackable = new Set(legal.attackMonsters);
  const seen = new Set();
  for (const key in byKey) {
    const occ = byKey[key];
    const room = state.house[key];
    if (!room) continue;
    const [wx, wy, wz] = roomWorld(room);
    occ.forEach((o, i) => {
      const [ox, oz] = ring(i, occ.length, 1.1);
      seen.add(o.id);
      let tok = tokenCache.get(o.id);
      if (o.kind === "p") {
        if (!tok) { tok = makePlayerToken(o.p); tokenCache.set(o.id, tok); }
        tok.target.set(wx + ox, wy, wz + oz);
        tok.active = state.activePlayerId === o.p.id;
        tok.beam.visible = tok.active;
        tok.beamLight.visible = tok.active;
        const traitor = o.p.side === "traitor";
        tok.traitorLight.visible = traitor;
        tok.el.className = "tok-lbl" + (traitor ? " traitor" : "");
        tok.el.textContent = o.p.name + (traitor ? " ☠" : "");
      } else {
        if (!tok) { tok = makeMonsterToken(o.m); tokenCache.set(o.id, tok); }
        tok.target.set(wx + ox, wy, wz + oz);
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
      new THREE.ConeGeometry(0.3, 0.7, 4),
      new THREE.MeshStandardMaterial({ color: 0xe8a85a, emissive: 0xe8a85a, emissiveIntensity: 1.2 }),
    );
    cone.position.set(wx + dx * (H + 0.4), wy + 0.9, wz + dy * (H + 0.4));
    cone.rotation.set(
      dir === "north" ? -Math.PI / 2 : dir === "south" ? Math.PI / 2 : 0,
      0,
      dir === "east" ? -Math.PI / 2 : dir === "west" ? Math.PI / 2 : 0,
    );
    cone.userData = { kind: "door", dir };
    arrowGroup.add(cone);
    const pl = new THREE.PointLight(0xe8a85a, 3, 2.5, 2);
    pl.position.copy(cone.position);
    arrowGroup.add(pl);
  }
}

// =========================================================================
// INPUT
// =========================================================================
function onClick(e) {
  if (!state || state.phase === "ended") return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([houseGroup, tokenGroup, arrowGroup], true);
  const me = state.activePlayerId;
  for (const h of hits) {
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
  DH.reduce(state, action);
  render();
  driveBots();
}

/** Surface the latest thing the active bot did as an on-screen cue, so a human
 *  can follow the other players' turns by watching rather than reading the log. */
function announceBot(fromLogLen) {
  const fresh = state.log.slice(fromLogLen);
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
  botTimer = setTimeout(() => {
    botTimer = null;
    const a = state.players.find((p) => p.id === state.activePlayerId);
    if (!a || !a.isBot || (state.phase !== "explore" && state.phase !== "haunt")) {
      render();
      return;
    }
    const before = { pos: a.position, move: state.movementLeft };
    const logLen = state.log.length;
    const step = DH.botStep(state, a.id);
    DH.reduce(state, step.action);
    const stalled =
      !step.endTurnAfter &&
      step.action.type !== "end-turn" &&
      a.position === before.pos &&
      state.movementLeft === before.move;
    if ((step.endTurnAfter && step.action.type !== "end-turn") || stalled) {
      if (state.activePlayerId === a.id) DH.reduce(state, { type: "end-turn", playerId: a.id });
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

  const activeColor = active?.characterId ? DH.CHARACTERS_BY_ID[active.characterId]?.color : null;
  const activeName = activeColor
    ? `<span class="turn-name" style="color:${activeColor}">${active.name}</span>`
    : (active?.name ?? "…");
  $("hud-top").innerHTML =
    `<div class="hud-turn">${state.phase === "haunt" ? '<span class="haunt-tag">THE HAUNT · </span>' : ""}` +
    `${ended ? '<span class="haunt-tag">CONCLUDED · </span>' : ""}Round ${state.turn} — ${activeName}` +
    `${!ended ? (botActing ? ' <span class="muted">is taking their turn…</span>' : ' <span class="you-tag">(your move)</span>') : ""}</div>` +
    `${!ended ? `<div class="hud-move">Movement: ${state.movementLeft}</div>` : ""}`;

  // party + log
  let roster = state.players.map((p) => {
    const c = p.characterId ? DH.CHARACTERS_BY_ID[p.characterId] : null;
    const room = p.position ? state.house[p.position] : null;
    const rn = room ? DH.ROOMS_BY_ID[room.roomId]?.name : "—";
    return `<div class="roster-row ${state.activePlayerId === p.id ? "active" : ""} ${!p.alive ? "dead" : ""}">` +
      `<span class="roster-dot" style="background:${c?.color ?? "#888"}"></span>` +
      `<span class="roster-name">${p.name}</span>${p.side === "traitor" ? '<span class="roster-traitor">☠</span>' : ""}` +
      `<span class="roster-room">${p.alive ? rn : "lost"}</span></div>`;
  }).join("");
  const log = state.log.slice(-40).map((e) => {
    const dice = e.dice?.length ? ` <span class="dice">${e.dice.map((v) => `<i class="die d${v}">${v}</i>`).join("")}</span>` : "";
    return `<div class="log-entry k-${e.kind}">${e.text}${dice}</div>`;
  }).join("");
  $("hud-left").innerHTML =
    `<div class="panel roster">${roster}</div>` +
    `<div class="panel log"><div class="log-title">Chronicle</div><div class="log-scroll" id="log-scroll">${log}</div></div>`;
  const ls = $("log-scroll"); if (ls) ls.scrollTop = ls.scrollHeight;

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
      `<div class="tp-head" style="border-color:${c.color}"><div class="tp-av" style="background:${c.color}">${c.name.charAt(0)}</div>` +
      `<div><strong>${c.name}</strong><div class="muted small">${c.title}</div></div>` +
      `${me.side ? `<span class="side-tag ${me.side}">${me.side === "traitor" ? "TRAITOR" : "HERO"}</span>` : ""}</div>` +
      (!me.alive ? `<div class="tp-dead">Lost to the house.</div>` : "") +
      `<div class="tp-traits">` + DH.TRAITS.map((t) => {
        const tr = c.traits[t]; const idx = me.traitIndex[t];
        return `<div class="tp-trait"><div class="tp-th"><span style="color:${TRAIT_COLOR[t]}">${t}</span><strong>${tr.values[idx]}</strong></div>` +
          `<div class="tp-track">` + tr.values.map((v, i) => `<span class="pip ${i === 0 ? "skull" : ""} ${i === idx ? "cur" : ""}" style="${i === idx ? `background:${TRAIT_COLOR[t]}` : ""}">${i === 0 ? "☠" : v}</span>`).join("") + `</div></div>`;
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

  // bottom controls — only on a human's turn
  let bottom = "";
  if (!ended && active && !active.isBot) {
    for (const cardId of legal.pickupItems ?? []) {
      bottom += `<button class="btn" onclick="window.__act({type:'pickup-item',playerId:'${active.id}',cardId:'${cardId}'})">Take ${DH.getCard(cardId)?.name ?? "item"}</button>`;
    }
    for (const id of legal.attackPlayers) {
      const name = state.players.find((p) => p.id === id)?.name ?? "foe";
      bottom += `<button class="btn danger" onclick="window.__act({type:'attack',playerId:'${active.id}',targetPlayerId:'${id}'})">Attack ${name}</button>`;
    }
    // Deliberate actions — each spends a step, so they trade off against moving.
    if (legal.canSearch) {
      bottom += `<button class="btn act" title="Rummage this room for an item — but you might disturb something (costs 1 step)" onclick="window.__act({type:'search',playerId:'${active.id}'})">🔍 Search the room</button>`;
    }
    if (legal.canInvestigate) {
      bottom += `<button class="btn act" title="A Knowledge check to read the danger ahead (costs 1 step)" onclick="window.__act({type:'investigate',playerId:'${active.id}'})">👁 Investigate</button>`;
    }
    if (legal.canRest) {
      bottom += `<button class="btn act" title="Catch your breath to recover your most-wounded trait — ends your movement" onclick="window.__act({type:'rest',playerId:'${active.id}'})">✚ Steady yourself</button>`;
    }
    const _broom = active.position ? state.house[active.position] : null;
    for (const dir of legal.barricadeDoors ?? []) {
      let label = dir;
      if (_broom) {
        const nKey = DH.neighborKey(_broom.floor, _broom.x, _broom.y, dir);
        const nDef = state.house[nKey] ? DH.ROOMS_BY_ID[state.house[nKey].roomId] : null;
        if (nDef) label = nDef.name;
      }
      bottom += `<button class="btn act" title="Wedge this door shut so nothing follows for a few rounds (costs 1 step)" onclick="window.__act({type:'barricade',playerId:'${active.id}',door:'${dir}'})">⛓ Barricade → ${label}</button>`;
    }
    bottom += `<button class="btn primary" onclick="window.__act({type:'end-turn',playerId:'${active.id}'})">End turn${humans.length > 1 ? " (pass device)" : ""}</button>`;
  }
  $("hud-bottom").innerHTML = bottom;

  // overlays
  const ov = $("overlay");
  if (haunt && state.haunt && state.phase === "haunt" && lastHauntShown !== state.haunt.id) {
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
  } else if (ended && inCampaign) {
    // A campaign chapter ends into the legacy screen, not the plain result card.
    ov.style.display = "none";
    ov.innerHTML = "";
    showLegacyEnd();
  } else if (ended) {
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

  // soft camera-follow: ease the orbit target toward the active player's room
  // (only nudges `target`, so the user can still orbit/zoom freely)
  if (state) {
    const active = state.players.find((p) => p.id === state.activePlayerId);
    const room = active && active.position ? state.house[active.position] : null;
    if (room) {
      const [cx, cy, cz] = roomWorld(room);
      camDesired.set(cx, cy + 0.7, cz);
    }
    controls.target.lerp(camDesired, 0.06);
    // Cinematic close-follow: when the user isn't actively orbiting, dolly the
    // camera IN along its current angle so whoever's up is framed close — leaning
    // a little tighter on a bot's turn so you actually watch the action. The
    // user's angle is preserved; grabbing the camera pauses this for ~2.5s.
    if (performance.now() - userCamAt > 2500) {
      camOffset.copy(camera.position).sub(controls.target);
      const dist = camOffset.length();
      const want = Math.max(controls.minDistance, Math.min(controls.maxDistance, active && active.isBot ? 9.5 : 11.5));
      camOffset.multiplyScalar(Math.max(0.0001, (dist + (want - dist) * 0.035)) / Math.max(0.0001, dist));
      camera.position.copy(controls.target).add(camOffset);
    }
  }
  controls.update();

  if (dust) {
    const a = dust.geometry.getAttribute("position");
    const arr = a.array;
    for (let i = 0; i < arr.length; i += 3) { arr[i + 1] += 0.012; if (arr[i + 1] > 14) arr[i + 1] = -12; }
    a.needsUpdate = true;
    dust.rotation.y += 0.0006;
  }
  for (const l of wisps) {
    const b = l.userData.base;
    const seed = b[0] + b[2];
    let f = 1 + Math.sin(t * 23 + seed) * 0.1 + Math.sin(t * 7.3 + seed * 2.1) * 0.16 + Math.sin(t * 1.7 + seed * 0.7) * 0.06;
    if (Math.random() < 0.015) f *= 0.55;
    l.intensity = Math.max(8, 18 * f);
    l.position.set(b[0] + Math.sin(t * 0.5 + b[2]) * 1.0, b[1] + Math.sin(t * 0.7) * 0.4, b[2] + Math.cos(t * 0.4 + b[0]) * 1.0);
  }
  // Ease each token toward its target room/offset and turn it to face the way
  // it's travelling, so a move reads as walking rather than a teleport.
  for (const tok of tokenCache.values()) {
    const g = tok.group;
    if (!tok.placed) { g.position.copy(tok.target); tok.placed = true; }
    const px = g.position.x, pz = g.position.z;
    // Slower glide (~0.22s vs ~0.11s) so a bot's room-to-room move is legible as
    // walking rather than a near-instant pop against its ~950ms turn step.
    g.position.lerp(tok.target, 1 - Math.exp(-4.5 * dt));
    const dx = g.position.x - px, dz = g.position.z - pz;
    if (dx * dx + dz * dz > 1e-6) {
      const desired = Math.atan2(dx, dz);
      const d = ((desired - tok.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      tok.yaw += d * (1 - Math.exp(-12 * dt));
    }
    g.rotation.y = tok.yaw;
    animateFigure(tok.fig, t, { active: tok.active, phase: tok.phase, baseY: tok.baseY });
  }

  // Ease every door toward its open/closed target and swing the leaf on its hinge.
  const nowMs = performance.now();
  for (const e of doorCache.values()) {
    if (e.openTarget === 1 && nowMs > e.closeAt) e.openTarget = 0;
    e.open += (e.openTarget - e.open) * (1 - Math.exp(-7 * dt));
    e.pivot.rotation.y = -e.open * DOOR_MAX_SWING;
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
  stage.appendChild(wRenderer.domElement);
  wScene = new THREE.Scene();
  wCam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
  wCam.position.set(0, 1.05, 2.45);
  wCam.lookAt(0, 0.82, 0);
  wScene.add(new THREE.AmbientLight(0x4a4660, 0.75));
  const key = new THREE.DirectionalLight(0xffe6c2, 1.6); key.position.set(2.5, 4, 3); wScene.add(key);
  const fill = new THREE.DirectionalLight(0x6a86c0, 0.55); fill.position.set(-3, 2, 1.5); wScene.add(fill);
  const rim = new THREE.PointLight(0xe8975a, 10, 9, 2); rim.position.set(0, 1.5, -1.6); wScene.add(rim);
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
  wMixers.length = 0;
  wFig = buildExplorerFigure(c.color, { archetype: charId });
  // If this character has a real rigged model, show it instead of the figure.
  if (attachAvatar(wTurn, charId, 1.5, wMixers)) wFig.visible = false;
  wTurn.add(wFig);
  $("w-name").textContent = c.name;
  $("w-title").textContent = c.title;
  $("w-flavor").textContent = c.flavor;
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
