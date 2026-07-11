/**
 * First-person quiet turns, verified headlessly: with the view set to
 * first person, OTHER players' card draws must never activate a modal
 * (they become toasts + room FX), while in the bird's-eye control run the
 * same draws do modal as before. Also captures the redesigned card.
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
const problems = [];
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};

async function playAndWatch(firstPerson, watchMs) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 250)}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 250)}`);
  });
  await page.addInitScript(
    `window.liveImport = ${LIVE_IMPORT}; performance.setResourceTimingBufferSize(8000);` +
      (firstPerson ? `localStorage.setItem("dh:view","first");` : `localStorage.removeItem("dh:view");`),
  );
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const st = (await liveImport("/src/state/store.ts")).useStore;
    st.getState().setName("Watcher");
    st.getState().playSolo("Watcher");
    // record every modal activation with its owner
    const beats = await liveImport("/src/state/beats.ts");
    window.__acts = [];
    beats.useBeats.subscribe((s, prev) => {
      if (s.active && s.active !== prev.active) {
        window.__acts.push({ kind: s.active.kind, mine: s.active.playerId === st.getState().playerId });
      }
      if (s.toasts.length > (prev.toasts?.length ?? 0)) window.__toasts = (window.__toasts ?? 0) + 1;
    });
  });
  // watch the bots play; never end own turn (so all cards seen are theirs)
  const t0 = Date.now();
  while (Date.now() - t0 < watchMs) {
    await page.evaluate(async () => {
      const st = (await liveImport("/src/state/store.ts")).useStore.getState();
      const g = st.game;
      if (g && g.phase === "explore" && g.activePlayerId === st.playerId) st.endTurn();
    });
    await page.waitForTimeout(1000);
  }
  const res = await page.evaluate(() => ({
    acts: window.__acts ?? [],
    toasts: window.__toasts ?? 0,
  }));
  // capture whatever card is up in overview mode for the design check
  if (!firstPerson) {
    const card = await page.locator(".draw-card").first();
    await card.screenshot({ path: "screenshots/live/card-design.png", timeout: 8000 }).catch(() => {});
  }
  await page.close();
  return res;
}

console.log("— first person run —");
const fp = await playAndWatch(true, 45000);
const fpOthers = fp.acts.filter((a) => a.kind === "card" && !a.mine);
console.log(`modals: ${fp.acts.length} (others' cards: ${fpOthers.length}) · toast batches: ${fp.toasts}`);
if (fpOthers.length > 0) fail(`others' cards went modal in first person (${fpOthers.length})`);
if (fp.toasts === 0) fail("no toasts appeared — others' draws vanished entirely");

console.log("— bird's-eye control run —");
const ov = await playAndWatch(false, 45000);
const ovOthers = ov.acts.filter((a) => a.kind === "card" && !a.mine);
console.log(`modals: ${ov.acts.length} (others' cards: ${ovOthers.length})`);
if (ovOthers.length === 0) fail("bird's-eye no longer modals others' cards — over-suppressed");

const real = problems.filter((p) => !/Download the React DevTools|GPU stall|THREE\.Clock/.test(p));
if (real.length) {
  for (const p of real) console.error(" ", p);
  fail(`${real.length} errors`);
}
console.log(process.exitCode ? "QUIET-TURNS VERIFY FAILED" : "QUIET-TURNS VERIFY OK");
await browser.close();
