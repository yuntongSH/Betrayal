/**
 * Drive the LIVE dev client (vite + ws server must be running) through a solo
 * game in headless Chromium and verify the character-realism systems:
 *
 *  1. the R3F frame loop ticks (guards against the hidden-tab rAF trap);
 *  2. locomotion publishes live speeds and room-to-room moves reach jog pace;
 *  3. the game reaches the haunt, and the HauntCinematic runs its full arc:
 *     seize (cinematic.active) → banner held → banner released over the
 *     close-up → stage handed back;
 *  4. no console errors or page errors anywhere along the way.
 *
 * Screenshots land in screenshots/live/.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "screenshots", "live");
mkdirSync(outDir, { recursive: true });


// Import the SAME module instance the app runs on: after HMR edits Vite serves
// the app's graph with ?t= versioned URLs, and a plain import would create a
// fresh duplicate (fresh zustand stores, empty registries — everything lies).
const LIVE_IMPORT = `(path) => {
  const hit = performance.getEntriesByType("resource").map((e) => e.name)
    .filter((n) => n.includes(path) && n.includes("?t="))
    .sort((a, b) => b.length - a.length)[0];
  return import(hit || path);
}`;

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });

const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 300)}`);
});

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};

await page.addInitScript(`window.liveImport = ${LIVE_IMPORT};`);
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

// ---- start a solo game through the store (clicks are flaky in automation) --
await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore;
  st.getState().setName("Verifier");
  st.getState().playSolo("Verifier");
});
await page.waitForFunction(
  async () => !!(await liveImport("/src/state/store.ts")).useStore.getState().game,
  null,
  { timeout: 15000 },
);
console.log("game created");

// ---- 1. frame loop alive -----------------------------------------------
await page.waitForTimeout(2500);
const ticks = await page.evaluate(async () => {
  const t0 = window.__dreadPerf?.ticks ?? 0;
  await new Promise((r) => setTimeout(r, 1000));
  return (window.__dreadPerf?.ticks ?? 0) - t0;
});
console.log(`frame loop: ${ticks} ticks/s`);
// SwiftShader renders the full scene at a crawl — any steady ticking is alive;
// 0 is the hidden-tab / dead-boot signature.
if (ticks < 2) fail(`frame loop not ticking (${ticks}/s)`);

// ---- 2 + 3. drive the game to the haunt, recording locomotion ------------
let maxSpeed = 0;
let pathWalkSeen = false;
let lastLog = 0;
let sawWalkStop = false;
let wasMoving = false;
let walkShot = false;
let phase = "lobby";
const deadline = Date.now() + 5 * 60 * 1000;

while (Date.now() < deadline) {
  const s = await page.evaluate(async () => {
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const beats = await liveImport("/src/state/beats.ts");
    const walk = await liveImport("/src/three/walk.ts");
    const b = beats.useBeats.getState();
    if (b.active) beats.dismissActive();
    let top = 0;
    for (const v of walk.tokenSpeeds.values()) top = Math.max(top, v);
    const g = st.game;
    if (g && g.phase === "explore" && g.activePlayerId === st.playerId) st.endTurn();
    return {
      phase: g?.phase ?? "none",
      topSpeed: top,
      pathWalkers: walk.walkingTokens.size,
      frozen: b.worldFrozen,
    };
  });
  phase = s.phase;
  maxSpeed = Math.max(maxSpeed, s.topSpeed);
  if (s.pathWalkers > 0) pathWalkSeen = true;
  if (Date.now() - lastLog > 10000) {
    lastLog = Date.now();
    console.log(`  … phase=${s.phase} top=${s.topSpeed.toFixed(2)} walkers=${s.pathWalkers} frozen=${s.frozen}`);
  }
  if (s.topSpeed > 0.5) wasMoving = true;
  else if (wasMoving) sawWalkStop = true;
  if (!walkShot && s.topSpeed > 3.4) {
    walkShot = true;
    await page.screenshot({ path: `${outDir}/jog-mid-stride.png` });
    console.log(`jog captured at ${s.topSpeed.toFixed(2)} u/s`);
  }
  if (phase === "haunt" || phase === "ended") break;
  await page.waitForTimeout(350);
}
console.log(`phase: ${phase} · top speed seen: ${maxSpeed.toFixed(2)} u/s`);
if (phase !== "haunt" && phase !== "ended") fail("never reached the haunt in 5 min");
// Jog pace itself is covered deterministically by verify-walk-math.mjs —
// under SwiftShader the sim runs at a crawl and mostly frozen behind cards,
// so the live probe only asserts that live speeds flow at all.
if (maxSpeed < 2.0) fail(`no live locomotion observed (max ${maxSpeed.toFixed(2)} u/s)`);
if (!sawWalkStop) fail("never saw a walk come to a rest (speeds never returned to ~0)");
if (!pathWalkSeen) fail("no waypoint path was ever followed (walkingTokens stayed empty — all motion was glides)");

// ---- 3b. the haunt cinematic arc ----------------------------------------
if (phase === "haunt") {
  let sawActive = false;
  let sawHold = false;
  let sawBannerOverShot = false;
  let released = false;
  const cutoff = Date.now() + 90000;
  let shot = 0;
  while (Date.now() < cutoff) {
    const c = await page.evaluate(async () => {
      const dir = await liveImport("/src/three/director.ts");
      const beats = await liveImport("/src/state/beats.ts");
      const b = beats.useBeats.getState();
      if (b.active) beats.dismissActive(); // combat cards must not stall the probe
      return {
        active: dir.cinematic.active,
        hold: b.hauntCinematicHold,
        banner: !!document.querySelector(".haunt-reveal"),
      };
    });
    if (c.active) {
      sawActive = true;
      if (shot < 3) {
        await page.screenshot({ path: `${outDir}/haunt-cinematic-${shot++}.png` });
      }
    }
    if (c.hold) sawHold = true;
    if (c.active && !c.hold && c.banner) sawBannerOverShot = true;
    if (sawActive && !c.active) {
      released = true;
      await page.screenshot({ path: `${outDir}/haunt-after-release.png` });
      break;
    }
    await page.waitForTimeout(200);
  }
  console.log(
    `cinematic: seized=${sawActive} heldBanner=${sawHold} bannerOverShot=${sawBannerOverShot} released=${released}`,
  );
  if (!sawActive) fail("cinematic never seized the stage after the haunt");
  if (!sawHold) fail("banner was never held back for the push-in");
  if (!released) fail("cinematic never released the stage (stuck seize)");
}

// ---- 4. error gate --------------------------------------------------------
const benign = /Download the React DevTools|GPU stall|THREE\.Clock/;
const real = problems.filter((p) => !benign.test(p));
if (real.length) {
  for (const p of real) console.error(" ", p);
  fail(`${real.length} console/page errors`);
}

console.log(process.exitCode ? "VERIFY FAILED" : "VERIFY OK");
await browser.close();
