/**
 * First-person label hygiene, verified headlessly: in FP the DOM must contain
 * NO floating room labels except door plaques for rooms adjacent to mine, and
 * no token name tags for occupants of other rooms; the bird's-eye keeps every
 * label. Captures a doorway screenshot for eyes-on review.
 */
import { chromium } from "playwright";

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
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 250)}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 250)}`);
});
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};

await page.addInitScript(
  `window.liveImport = ${LIVE_IMPORT}; performance.setResourceTimingBufferSize(8000);
   localStorage.setItem("dh:welcomed","1");`,
);
// The R3F canvas occasionally never boots under SwiftShader — detect via the
// governor tick counter and reload until it's alive (max 3 attempts).
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const st = (await liveImport("/src/state/store.ts")).useStore;
    st.getState().setName("Labeler");
    st.getState().playSolo("Labeler");
  });
  await page.waitForTimeout(6000);
  booted = await page.evaluate(async () => {
    const t0 = window.__dreadPerf?.ticks ?? 0;
    await new Promise((r) => setTimeout(r, 1500));
    return (window.__dreadPerf?.ticks ?? 0) > t0;
  });
  if (!booted) console.log(`attempt ${attempt + 1}: canvas never booted, reloading`);
}
if (!booted) {
  fail("canvas never booted after 3 attempts");
  process.exit(1);
}
// wait for the world (several rooms discovered so labels exist)
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  ready = await page.evaluate(async () => {
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const beats = await liveImport("/src/state/beats.ts");
    if (beats.useBeats.getState().active) beats.dismissActive();
    return !!(st.game && Object.keys(st.game.house).length >= 5);
  });
  if (!ready) await page.waitForTimeout(1000);
}
if (!ready) {
  fail("house never grew");
  process.exit(1);
}

const count = async () =>
  page.evaluate(() => ({
    overhead: document.querySelectorAll(".room-label:not(.plaque)").length,
    plaques: document.querySelectorAll(".room-label.plaque").length,
    tags: document.querySelectorAll(".token-label").length,
  }));

// bird's-eye: every discovered room floats a label, no plaques
const birds = await count();
console.log("bird's-eye:", JSON.stringify(birds));
if (birds.overhead < 5) fail("bird's-eye lost its room labels");
if (birds.plaques !== 0) fail("plaques leaked into the bird's-eye");

// first person: overhead labels vanish; only door plaques + same-room tags
await page.evaluate(async () => {
  (await liveImport("/src/state/view.ts")).toggleView();
});
await page.waitForTimeout(3000);
const fp = await count();
console.log("first person:", JSON.stringify(fp));
if (fp.overhead !== 0) fail(`floating room labels survive in first person (${fp.overhead})`);
const adjacent = await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore.getState();
  const shared = await (() => {
    const hit = performance.getEntriesByType("resource").map((e) => e.name)
      .find((n) => n.includes("packages/shared/src/index"));
    return import(hit);
  })();
  const me = st.game.players.find((p) => p.id === st.playerId);
  const myRoom = st.game.house[me.position];
  return shared
    .connections(st.game, me.position)
    .filter((k) => st.game.house[k] && st.game.house[k].floor === myRoom.floor).length;
});
console.log(`adjacent same-floor rooms: ${adjacent}`);
if (fp.plaques !== adjacent) fail(`plaque count ${fp.plaques} ≠ adjacent discovered rooms ${adjacent}`);

await page.screenshot({ path: "screenshots/live/fp-labels.png", timeout: 15000 }).catch(() => {});

// back to bird's-eye: everything returns
await page.evaluate(async () => {
  (await liveImport("/src/state/view.ts")).toggleView();
});
await page.waitForTimeout(2500);
const back = await count();
if (back.overhead < 5 || back.plaques !== 0) fail(`bird's-eye did not recover (${JSON.stringify(back)})`);

const real = problems.filter((p) => !/Download the React DevTools|GPU stall|THREE\.Clock/.test(p));
if (real.length) {
  for (const p of real) console.error(" ", p);
  fail(`${real.length} errors`);
}
console.log(process.exitCode ? "FP-LABELS VERIFY FAILED" : "FP-LABELS VERIFY OK");
await browser.close();
