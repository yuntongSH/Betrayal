import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { buildRoomDecor, roomTheme, buildExplorerFigure, buildMonsterFigure, animateFigure, materials, surfaceFor } from "@dread-hollow/decor";

const DH = window.DH;
const $ = (id) => document.getElementById(id);

// ---- world layout (mirrors the React client) -----------------------------
const TILE = 4;
const WALL_H = 2.4;
const FLOOR_GAP = 7;
const FLOOR_Y = { basement: -FLOOR_GAP, ground: 0, upper: FLOOR_GAP };
const TRAIT_COLOR = { speed: "#d8b54a", might: "#c2412f", sanity: "#6fb6b5", knowledge: "#7a6db0" };
const SPECIAL_GLOW = {
  "heal-sanity": 0x6fb6b5, "heal-might": 0xe8a85a, "drain-speed": 0x5a6f9a,
  pit: 0x3a2a2a, "draw-extra-omen": 0x8c2f23, vault: 0xc8a23a,
};
const DIRS = ["north", "east", "south", "west"];
const KEY_DIR = {
  ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east",
  w: "north", s: "south", a: "west", d: "east",
  W: "north", S: "south", A: "west", D: "east",
};

function roomWorld(r) { return [r.x * TILE, FLOOR_Y[r.floor], r.y * TILE]; }
function ring(i, n, rad) { if (n <= 1) return [0, 0]; const a = (i / n) * Math.PI * 2; return [Math.cos(a) * rad, Math.sin(a) * rad]; }

// ---- game state ----------------------------------------------------------
let state = null;
let lastHauntShown = null;
let botTimer = null; // pending local bot step
const party = []; // { pid, charId }

// ---- three.js objects ----------------------------------------------------
let scene, camera, renderer, labelRenderer, controls, raycaster, pointer;
let houseGroup, tokenGroup, arrowGroup;
let dust, wisps = [];
let anims = []; // per-render animated tokens
const roomCache = new Map(); // key -> { group, floorMat, labelEl } built once per room
const camDesired = new THREE.Vector3(0, 0, 4); // soft camera-follow target

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
    card.onclick = () => {
      const idx = party.findIndex((p) => p.charId === c.id);
      if (idx >= 0) party.splice(idx, 1);
      else party.push({ pid: "p" + c.id, charId: c.id });
      buildLobby();
    };
    grid.appendChild(card);
  });
  $("begin-btn").disabled = party.length < 1;
  $("party-count").textContent = party.length;
}

function beginGame(solo) {
  state = DH.createGame("local", (Math.random() * 1e9) | 0);
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
  scene.background = new THREE.Color(0x06060a);
  scene.fog = new THREE.Fog(0x070710, 11, 42);

  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
  camera.position.set(12, 14, 18);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
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

  scene.add(new THREE.AmbientLight(0x2a3a5e, 0.12));
  const hemi = new THREE.HemisphereLight(0x26324f, 0x080604, 0.22);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xaebfe8, 0.9);
  moon.position.set(14, 28, 6);
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
  scene.add(houseGroup, tokenGroup, arrowGroup);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  renderer.domElement.addEventListener("pointerdown", onClick);
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyMove);
  animate();
}

/** Arrow keys / WASD move the active human player. */
function onKeyMove(e) {
  if (!state || (state.phase !== "explore" && state.phase !== "haunt")) return;
  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (!active || active.isBot) return;
  const dir = KEY_DIR[e.key];
  if (!dir) return;
  const legal = DH.legalMoves(state, active.id);
  const room = active.position ? state.house[active.position] : null;
  if (!room) return;
  if (legal.doors.includes(dir)) {
    e.preventDefault();
    act({ type: "explore", playerId: active.id, door: dir });
    return;
  }
  const nKey = DH.neighborKey(room.floor, room.x, room.y, dir);
  if (legal.explored.includes(nKey)) {
    e.preventDefault();
    act({ type: "move-to", playerId: active.id, toKey: nKey });
  }
}

function clearGroup(g) {
  for (let i = g.children.length - 1; i >= 0; i--) {
    const c = g.children[i];
    c.traverse?.((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
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

  const accent = new THREE.PointLight(theme.accent, theme.accentIntensity * 7, TILE * 1.7, 2.4);
  accent.position.set(0, WALL_H * 0.55, 0);
  g.add(accent);

  const el = document.createElement("div");
  el.className = "lbl3d";
  el.textContent = def?.name ?? "Room";
  const lbl = new CSS2DObject(el);
  lbl.position.set(0, WALL_H + 0.4, 0);
  g.add(lbl);

  houseGroup.add(g);
  return { group: g, floor, floorMat, labelEl: el };
}

/** Sync the house: build new rooms once, then just refresh highlight state. */
function buildHouse(legal) {
  const hi = new Set(legal.explored);
  for (const room of Object.values(state.house)) {
    let entry = roomCache.get(room.key);
    if (!entry) {
      entry = buildRoomGroup(room);
      roomCache.set(room.key, entry);
    }
    const lit = hi.has(room.key);
    entry.floor.userData.lit = lit;
    // Color now multiplies the procedural map: white keeps the texture intact
    // while the emissive provides the lit highlight; otherwise tint by theme.
    entry.floorMat.color.set(lit ? 0xffffff : roomTheme(room.roomId).floor);
    entry.floorMat.emissive.set(lit ? 0x5a8f5a : 0x000000);
    entry.floorMat.emissiveIntensity = lit ? 0.5 : 0;
    entry.labelEl.className = "lbl3d" + (lit ? " lit" : "");
  }
}

function playerToken(x, y, z, p, isActive) {
  const char = p.characterId ? DH.CHARACTERS_BY_ID[p.characterId] : null;
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const fig = buildExplorerFigure(char?.color ?? "#aaaaaa", { archetype: p.characterId });
  g.add(fig);

  if (isActive) {
    g.add(new THREE.PointLight(0xe8a85a, 5, 4, 2));
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.5, 3.2, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe8a85a, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    beam.position.y = 1.6;
    g.add(beam);
  }
  if (p.side === "traitor") g.add(new THREE.PointLight(0xc2412f, 4, 3, 2));

  const el = document.createElement("div");
  el.className = "tok-lbl" + (p.side === "traitor" ? " traitor" : "");
  el.textContent = p.name + (p.side === "traitor" ? " ☠" : "");
  const lbl = new CSS2DObject(el);
  lbl.position.set(0, 1.9, 0);
  g.add(lbl);

  tokenGroup.add(g);
  anims.push({ obj: fig, baseY: 0.02, active: isActive, phase: Math.random() * 6 });
}

function monsterToken(x, y, z, m, attackable) {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const fig = buildMonsterFigure(m.name);
  // tag for raycast click detection WITHOUT clobbering the figure's animation
  // tags (figKind / parts on the group, baseRX caches on tagged parts).
  fig.traverse((o) => {
    o.userData.kind = "monster";
    o.userData.monsterId = m.id;
    o.userData.attackable = attackable;
  });
  g.add(fig);
  g.add(new THREE.PointLight(0xc2412f, attackable ? 5 : 2.5, 4, 2));

  const el = document.createElement("div");
  el.className = "tok-lbl monster";
  el.textContent = `${m.name} · ${m.hp}♥${attackable ? " — strike" : ""}`;
  const lbl = new CSS2DObject(el);
  lbl.position.set(0, 1.9, 0);
  g.add(lbl);

  tokenGroup.add(g);
  anims.push({ obj: fig, baseY: 0.05, phase: 0 });
}

function buildTokens(legal) {
  clearGroup(tokenGroup);
  anims = [];
  const byKey = {};
  for (const p of state.players) if (p.alive && p.position) (byKey[p.position] ??= []).push({ kind: "p", p });
  for (const m of state.haunt?.monsters ?? []) if (m.hp > 0 && m.position) (byKey[m.position] ??= []).push({ kind: "m", m });

  const attackable = new Set(legal.attackMonsters);
  for (const key in byKey) {
    const occ = byKey[key];
    const room = state.house[key];
    if (!room) continue;
    const [wx, wy, wz] = roomWorld(room);
    occ.forEach((o, i) => {
      const [ox, oz] = ring(i, occ.length, 1.1);
      if (o.kind === "p") playerToken(wx + ox, wy, wz + oz, o.p, state.activePlayerId === o.p.id);
      else monsterToken(wx + ox, wy, wz + oz, o.m, attackable.has(o.m.id));
    });
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

/** Local bot driver: step the active bot on a timer, then hand back to humans. */
function driveBots() {
  if (botTimer) return;
  if (!state || (state.phase !== "explore" && state.phase !== "haunt")) return;
  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (!active || !active.isBot) return;
  botTimer = setTimeout(() => {
    botTimer = null;
    const a = state.players.find((p) => p.id === state.activePlayerId);
    if (!a || !a.isBot || (state.phase !== "explore" && state.phase !== "haunt")) {
      render();
      return;
    }
    const before = { pos: a.position, move: state.movementLeft };
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
    render();
    driveBots();
  }, 650);
}

// =========================================================================
// RENDER (state -> scene + HUD)
// =========================================================================
function render() {
  const me = state.activePlayerId;
  const legal = me ? DH.legalMoves(state, me) : { explored: [], doors: [], attackMonsters: [], attackPlayers: [], pickupItems: [], tradePartners: [] };
  buildHouse(legal);
  buildTokens(legal);
  buildArrows(legal);
  updateHUD(legal);
}

function tagIcon(cardId) {
  const c = DH.getCard(cardId);
  if (!c) return "•";
  if (c.type === "omen") return "☠";
  if (c.effect.kind === "item-passive") {
    return { weapon: "⚔", armor: "🛡", key: "🗝", light: "🔦", holy: "✝", occult: "👁" }[c.effect.tag] ?? "•";
  }
  return "•";
}

function updateHUD(legal) {
  const active = state.players.find((p) => p.id === state.activePlayerId);
  const humans = state.players.filter((p) => !p.isBot);
  // Solo: always show the (single) human. Hotseat: whoever's turn it is.
  const me = humans.length === 1 ? humans[0] : active;
  const ended = state.phase === "ended";
  const haunt = state.phase === "haunt" || ended;
  const botActing = !!active && active.isBot && !ended;

  $("hud-top").innerHTML =
    `<div class="hud-turn">${state.phase === "haunt" ? '<span class="haunt-tag">THE HAUNT · </span>' : ""}` +
    `${ended ? '<span class="haunt-tag">CONCLUDED · </span>' : ""}Round ${state.turn} — ${active?.name ?? "…"}` +
    `${!ended ? (botActing ? ' <span class="muted">(bot…)</span>' : ' <span class="you-tag">(your move)</span>') : ""}</div>` +
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
    $("hud-right").innerHTML =
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
      (me.inventory.length ? `<ul>${me.inventory.map((id) => `<li><span class="ii">${tagIcon(id)}</span>${DH.getCard(id)?.name ?? id}</li>`).join("")}</ul>` : `<div class="muted small">nothing</div>`) + `</div>` +
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
    bottom += `<button class="btn primary" onclick="window.__act({type:'end-turn',playerId:'${active.id}'})">End turn${humans.length > 1 ? " (pass device)" : ""}</button>`;
  }
  $("hud-bottom").innerHTML = bottom;

  // overlays
  const ov = $("overlay");
  if (haunt && state.haunt && state.phase === "haunt" && lastHauntShown !== state.haunt.id) {
    const amT = me?.side === "traitor";
    const tnames = state.haunt.traitorIds.map((id) => state.players.find((p) => p.id === id)?.name ?? "someone").join(", ");
    ov.style.display = "grid";
    ov.innerHTML =
      `<div class="haunt-card"><div class="kick">The house turns…</div><h2>${state.haunt.name}</h2>` +
      `<p>${amT ? '<strong class="tt">You are the traitor.</strong>' : `The traitor is <strong class="tt">${tnames}</strong>.`}</p>` +
      `<div class="hgoals"><div class="${amT ? "ga" : ""}"><span class="muted small">Traitor</span>${state.haunt.traitorGoal}</div>` +
      `<div class="${!amT ? "ga" : ""}"><span class="muted small">Heroes</span>${state.haunt.heroGoal}</div></div>` +
      `<button class="btn primary" onclick="window.__dismiss()">${amT ? "Begin the betrayal" : "Survive"}</button></div>`;
  } else if (ended) {
    ov.style.display = "grid";
    ov.innerHTML = `<div class="result"><div class="rtitle">${state.winner === "heroes" ? "The Heroes Survive" : "The Traitor Triumphs"}</div>` +
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

  // soft camera-follow: ease the orbit target toward the active player's room
  // (only nudges `target`, so the user can still orbit/zoom freely)
  if (state) {
    const active = state.players.find((p) => p.id === state.activePlayerId);
    const room = active && active.position ? state.house[active.position] : null;
    if (room) {
      const [cx, cy, cz] = roomWorld(room);
      camDesired.set(cx, cy + 0.6, cz);
    }
    controls.target.lerp(camDesired, 0.025);
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
  for (const an of anims) {
    animateFigure(an.obj, t, { active: an.active, phase: an.phase, baseY: an.baseY });
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// boot
$("begin-btn").onclick = () => beginGame(false);
$("solo-btn").onclick = () => beginGame(true);
buildLobby();
