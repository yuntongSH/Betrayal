/**
 * First-person visual audit — start a solo game with the view pre-set to
 * first person, then walk the manor over several turns (explore new rooms,
 * fall back to moving through known ones), aiming the eyes at a different
 * wall each stop, and capture a screenshot per DISTINCT room to
 * screenshots/audit/. Manual polls only (SwiftShader renders ~2fps).
 *
 * Usage: node scripts/audit-fp-shots.mjs   (dev server on :5173 required)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT_DIR = "screenshots/audit";
const TARGET_SHOTS = 7; // distinct rooms to photograph (task asks 6+)
const DEADLINE_MS = 8.5 * 60 * 1000;
const RENDER_WAIT_MS = 3200; // SwiftShader needs ~3s to actually paint a change

mkdirSync(OUT_DIR, { recursive: true });

const LIVE_IMPORT = `(path) => {
  const hit = performance.getEntriesByType("resource").map((e) => e.name)
    .filter((n) => n.includes(path) && n.includes("?t="))
    .sort((a, b) => b.length - a.length)[0];
  return import(hit || path);
}`;

// The shared engine package as vite serves it to the client (legalMoves etc.).
const SHARED = "/@fs/Users/max/Betrayal/packages/shared/src/index.ts";

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 300)}`);
});

const t0 = Date.now();
const timeLeft = () => DEADLINE_MS - (Date.now() - t0);

// Pre-set first-person view BEFORE the app boots, plus the live-import helper.
await page.addInitScript(
  `window.liveImport = ${LIVE_IMPORT};
   performance.setResourceTimingBufferSize(8000);
   try {
     localStorage.setItem("dh:view", "first");
     localStorage.setItem("dh:welcomed", "1"); // no first-night overlay over the shots
   } catch {}`,
);
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore;
  st.getState().setName("Audit");
  st.getState().playSolo("Audit");
});

// Manual poll: game up + my token tracked (canvas booted).
let ready = false;
for (let i = 0; i < 45 && !ready; i++) {
  ready = await page.evaluate(async () => {
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const fc = await liveImport("/src/three/followCam.ts");
    return !!(st.playerId && st.game && fc.trackedTokens.get(st.playerId));
  });
  if (!ready) await page.waitForTimeout(1000);
}
if (!ready) {
  console.error("FAIL: game/token never came up");
  await browser.close();
  process.exit(1);
}
console.log("game up, token tracked, first-person preset");

// --- page-side helpers -------------------------------------------------------

/** One snapshot of everything the walker loop needs. */
async function readState() {
  return page.evaluate(async (sharedPath) => {
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const sh = await liveImport(sharedPath);
    const fc = await liveImport("/src/three/followCam.ts");
    const dir = await liveImport("/src/three/director.ts");
    const beats = await liveImport("/src/state/beats.ts");
    const g = st.game;
    if (!g || !st.playerId) return null;
    const me = g.players.find((p) => p.id === st.playerId);
    const legal = sh.legalMoves(g, st.playerId);
    const pos = me?.position ?? null;
    const grid = pos ? sh.parseKey(pos) : null;
    return {
      myTurn: g.activePlayerId === st.playerId,
      phase: g.phase,
      alive: !!me?.alive,
      pos,
      grid, // { floor, x, y }
      roomId: pos ? (g.house[pos]?.roomId ?? "unknown") : null,
      movementLeft: g.movementLeft,
      doors: legal.doors,
      explored: legal.explored,
      canEndTurn: legal.canEndTurn,
      beatsBusy: beats.beatsBusy(),
      tokenMoving: fc.followTarget.moving,
      cinematic: dir.cinematic.active,
      fpDriving: dir.firstPerson.driving,
    };
  }, SHARED);
}

/** Dismiss the active modal beat and cast any dice waiting in our hand. */
async function unblockPresentation() {
  await page.evaluate(async () => {
    const beats = await liveImport("/src/state/beats.ts");
    if (beats.useBeats.getState().active) beats.dismissActive();
    beats.throwDice();
  });
}

/** Poll until nothing modal is up, no walk is in flight, and no cinematic. */
async function settle(maxMs = 18000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    await unblockPresentation();
    const s = await readState();
    if (s && !s.beatsBusy && !s.tokenMoving && !s.cinematic) return s;
    await page.waitForTimeout(500);
  }
  return readState();
}

/** Aim the eyes: absolute yaw in radians (camera forward at yaw 0 = -Z = north). */
async function aim(yaw, pitch = -0.05) {
  await page.evaluate(
    async ({ yaw, pitch }) => {
      const rig = await liveImport("/src/three/FirstPersonRig.tsx");
      rig.fpLook.yaw = yaw;
      rig.fpLook.pitch = pitch;
    },
    { yaw, pitch },
  );
}

// --- the walk ----------------------------------------------------------------

const captured = new Map(); // roomKey -> filename
const visited = new Set(); // roomKeys we've stood in (prefer novel moves)
let shotSeq = 0;
let prevGrid = null;

/** Yaw that faces the way we just walked (grid dx/dy; world x=grid x, z=grid y). */
function travelYaw(from, to) {
  if (!from || !to || from.floor !== to.floor) return 0;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(-dx, -dy);
}

async function captureHere(state) {
  if (!state.pos || captured.has(state.pos)) return;
  // Vary which wall we face: travel direction, then swing left/right/back
  // across successive shots so the audit sees every kind of surface.
  const base = travelYaw(prevGrid, state.grid);
  const swing = [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, Math.PI * 0.75];
  const yaw = base + swing[shotSeq % swing.length];
  await aim(yaw);
  await page.waitForTimeout(RENDER_WAIT_MS);
  await unblockPresentation(); // a toast is fine; a modal card is not
  await page.waitForTimeout(600);
  shotSeq += 1;
  const deg = Math.round(((yaw % (Math.PI * 2)) * 180) / Math.PI);
  const file = `${OUT_DIR}/shot-${String(shotSeq).padStart(2, "0")}-${state.roomId}-yaw${deg}.png`;
  await page.screenshot({ path: file, timeout: 25000 }).catch((e) => {
    console.error("screenshot failed:", e.message);
    shotSeq -= 1;
  });
  if (shotSeq > 0 && !captured.has(state.pos)) {
    captured.set(state.pos, file);
    console.log(`shot ${shotSeq}: ${state.roomId} @ ${state.pos} yaw ${deg}° -> ${file}`);
  }
}

while (captured.size < TARGET_SHOTS && timeLeft() > 20000) {
  // Wait for my turn (bots play in between; keep the presentation unstuck).
  let s = null;
  for (let i = 0; i < 90 && timeLeft() > 20000; i++) {
    await unblockPresentation();
    s = await readState();
    if (!s) break;
    if (s.phase === "ended" || !s.alive) break;
    if (s.myTurn && !s.cinematic) break;
    await page.waitForTimeout(1000);
  }
  if (!s || s.phase === "ended" || !s.alive) {
    console.log(`stopping walk: ${!s ? "no state" : s.phase === "ended" ? "game ended" : "we died"}`);
    break;
  }
  if (!s.myTurn) continue;

  // First room of the game hasn't been photographed yet — start with it.
  s = await settle();
  if (s?.pos) visited.add(s.pos);
  if (s && !captured.has(s.pos) && s.fpDriving) await captureHere(s);

  // Spend this turn's movement stepping into fresh rooms, shooting each one.
  for (let step = 0; step < 5; step++) {
    s = await readState();
    if (!s || !s.myTurn || s.phase === "ended" || !s.alive) break;
    prevGrid = s.grid;

    if (s.doors.length > 0) {
      // A door that can draw a brand-new room is always the best photo op.
      const door = s.doors[Math.floor(Math.random() * s.doors.length)];
      console.log(`explore ${door} from ${s.roomId}`);
      await page.evaluate(async (d) => {
        (await liveImport("/src/state/store.ts")).useStore.getState().explore(d);
      }, door);
    } else if (s.explored.length > 0 && s.movementLeft > 0) {
      const novel = s.explored.filter((k) => !visited.has(k));
      const toKey = (novel.length ? novel : s.explored)[0];
      console.log(`moveTo ${toKey} from ${s.roomId}`);
      await page.evaluate(async (k) => {
        (await liveImport("/src/state/store.ts")).useStore.getState().moveTo(k);
      }, toKey);
    } else break;

    s = await settle(); // dismiss the draw's card, wait out the walk
    if (!s) break;
    if (s.pos) visited.add(s.pos);
    if (s.alive && s.fpDriving && !captured.has(s.pos)) await captureHere(s);
    if (captured.size >= TARGET_SHOTS || s.movementLeft <= 0) break;
  }

  s = await readState();
  if (s?.myTurn) {
    await page.evaluate(async () => {
      (await liveImport("/src/state/store.ts")).useStore.getState().endTurn();
    });
    await page.waitForTimeout(800);
  }
}

console.log(`captured ${captured.size} rooms:`);
for (const [key, file] of captured) console.log(`  ${key} -> ${file}`);

const real = problems.filter(
  (p) => !/Download the React DevTools|GPU stall|THREE\.Clock|WebGL warning|Automatic fallback/.test(p),
);
if (real.length) {
  console.error(`${real.length} page errors during the walk:`);
  for (const p of real.slice(0, 10)) console.error(" ", p);
}
if (captured.size < 6) {
  console.error(`FAIL: only ${captured.size} distinct rooms captured (need 6+)`);
  process.exitCode = 1;
} else {
  console.log("AUDIT SHOTS OK");
}
await browser.close();
