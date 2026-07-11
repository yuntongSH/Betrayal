/**
 * First-person view, verified headlessly: start a solo game, flip the view
 * with the store toggle, and assert the rig actually owns the frame —
 * camera at eye height on the player's token, first-person FOV, director
 * stood down, own body hidden — then flip back and assert full recovery.
 * Also unit-checks the eyes-relative arrow mapping. Manual polls only.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("screenshots/live", { recursive: true });

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
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 300)}`);
});
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};

await page.addInitScript(`window.liveImport = ${LIVE_IMPORT}; performance.setResourceTimingBufferSize(8000);`);
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore;
  st.getState().setName("Eyes");
  st.getState().playSolo("Eyes");
});
// manual poll: game up + my token tracked (canvas booted)
let ready = false;
for (let i = 0; i < 40 && !ready; i++) {
  ready = await page.evaluate(async () => {
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const fc = await liveImport("/src/three/followCam.ts");
    return !!(st.playerId && fc.trackedTokens.get(st.playerId));
  });
  if (!ready) await page.waitForTimeout(1000);
}
if (!ready) {
  fail("game/token never came up");
  process.exit(1);
}
console.log("game up, token tracked");

// --- the arrow mapping is pure math: check all four quadrants -------------
const compass = await page.evaluate(async () => {
  const rig = await liveImport("/src/three/FirstPersonRig.tsx");
  const out = {};
  for (const [label, yaw] of [
    ["north", 0],
    ["west", Math.PI / 2],
    ["south", Math.PI],
    ["east", -Math.PI / 2],
  ]) {
    rig.fpLook.yaw = yaw;
    out[label] = rig.facingDirection();
  }
  rig.fpLook.yaw = 0;
  return out;
});
console.log("facing map:", JSON.stringify(compass));
if (compass.north !== "north" || compass.south !== "south" || compass.east !== "east" || compass.west !== "west")
  fail("facingDirection compass mapping is wrong");

// --- flip to first person --------------------------------------------------
await page.evaluate(async () => {
  (await liveImport("/src/state/view.ts")).toggleView();
});
await page.waitForTimeout(2500);

const fp = await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore.getState();
  const fc = await liveImport("/src/three/followCam.ts");
  const dir = await liveImport("/src/three/director.ts");
  const tok = fc.trackedTokens.get(st.playerId);
  const rig = await liveImport("/src/three/FirstPersonRig.tsx");
  return {
    driving: dir.firstPerson.driving,
    tokenY: tok ? tok.obj.position.y : null,
    camY: rig.fpCamProbe.y,
    fov: rig.fpCamProbe.fov,
    bodyVisible: tok ? tok.obj.children.find((c) => c.type === "Group")?.visible : null,
  };
});
console.log("first person:", JSON.stringify(fp));
if (!fp.driving) fail("rig never took the frame (firstPerson.driving stayed false)");
if (fp.bodyVisible !== false) fail(`own body still visible in first person (visible=${fp.bodyVisible})`);
if (fp.fov !== 68) fail(`first-person FOV not applied (fov=${fp.fov})`);
if (fp.tokenY == null || Math.abs(fp.camY - fp.tokenY - 1.52) > 0.06)
  fail(`camera not at eye height (camY=${fp.camY} tokenY=${fp.tokenY})`);

for (let i = 0; i < 8; i++) {
  await page.evaluate(async () => {
    const beats = await liveImport("/src/state/beats.ts");
    if (beats.useBeats.getState().active) beats.dismissActive();
  });
  await page.waitForTimeout(400);
}
await page.screenshot({ path: "screenshots/live/first-person.png", timeout: 15000 }).catch(() => {});

// --- flip back and confirm recovery -----------------------------------------
await page.evaluate(async () => {
  (await liveImport("/src/state/view.ts")).toggleView();
});
await page.waitForTimeout(2500);
const back = await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore.getState();
  const fc = await liveImport("/src/three/followCam.ts");
  const dir = await liveImport("/src/three/director.ts");
  const tok = fc.trackedTokens.get(st.playerId);
  const rig = await liveImport("/src/three/FirstPersonRig.tsx");
  return {
    driving: dir.firstPerson.driving,
    fov: rig.fpCamProbe.fov,
    bodyVisible: tok ? tok.obj.children.find((c) => c.type === "Group")?.visible : null,
  };
});
console.log("back to overview:", JSON.stringify(back));
if (back.fov !== 48) fail(`tactical FOV not restored (fov=${back.fov})`);
if (back.driving) fail("rig failed to release the frame on toggle-back");
if (back.bodyVisible !== true) fail("own body did not reappear after toggle-back");

await page.screenshot({ path: "screenshots/live/overview-restored.png", timeout: 15000 }).catch(() => {});

const real = problems.filter((p) => !/Download the React DevTools|GPU stall|THREE\.Clock/.test(p));
if (real.length) {
  for (const p of real) console.error(" ", p);
  fail(`${real.length} errors`);
}
console.log(process.exitCode ? "FIRST-PERSON VERIFY FAILED" : "FIRST-PERSON VERIFY OK");
await browser.close();
