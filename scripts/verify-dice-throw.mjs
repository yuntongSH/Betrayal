/**
 * Player-thrown dice, verified headlessly: start a solo game, take an action
 * that rolls (investigate), and assert the tray arrives HELD (no tumble),
 * stays held, then settles onto the real faces only after throwDice() —
 * the server's roll revealed by the player's own hand. Manual polls only.
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
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 300)}`);
});
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};
const poll = async (fn, timeoutMs = 30000, every = 500) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await page.evaluate(fn);
    if (v) return v;
    await page.waitForTimeout(every);
  }
  return null;
};

await page.addInitScript(`window.liveImport = ${LIVE_IMPORT}; performance.setResourceTimingBufferSize(8000);`);
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore;
  st.getState().setName("Roller");
  st.getState().playSolo("Roller");
});
const myTurn = await poll(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore.getState();
  const beats = await liveImport("/src/state/beats.ts");
  if (beats.useBeats.getState().active) beats.dismissActive();
  return !!(st.game && st.game.phase === "explore" && st.game.activePlayerId === st.playerId);
}, 60000);
if (!myTurn) {
  fail("never got my turn");
  process.exit(1);
}
console.log("my turn — investigating (rolls Knowledge)");
await page.evaluate(async () => {
  const beats = await liveImport("/src/state/beats.ts");
  window.__trayLog = [];
  beats.useBeats.subscribe((s, prev) => {
    if (s.diceTray !== prev.diceTray) {
      const t = s.diceTray;
      window.__trayLog.push(
        `${Date.now() % 100000} ${t ? `id=${t.id} held=${t.held} settled=${t.settled} out=${t.out}` : "null"}`,
      );
    }
  });
});
await page.evaluate(async () => {
  (await liveImport("/src/state/store.ts")).useStore.getState().investigate();
});

// The tray must arrive HELD, with no faces settled. Bot rolls queued ahead
// of ours play through first (~4.5s each) — poll generously and keep cards
// flowing so the queue drains.
const held = await poll(async () => {
  const beats = await liveImport("/src/state/beats.ts");
  if (beats.useBeats.getState().active) beats.dismissActive();
  const t = beats.useBeats.getState().diceTray;
  return t && t.held ? { n: t.dice.length, settled: t.settled } : null;
}, 60000, 300);
if (!held) {
  fail("my roll never arrived as a held tray");
} else {
  console.log(`tray held: ${held.n} dice, settled=${held.settled}`);
  const dom = await page.evaluate(() => {
    const el = document.querySelector(".dice-tray");
    const layer = document.querySelector(".dice-layer");
    const r = el?.getBoundingClientRect();
    const cs = el ? getComputedStyle(el) : null;
    return {
      rect: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      opacity: cs?.opacity,
      display: cs?.display,
      layerRect: layer ? (({ x, y, width, height }) => [Math.round(x), Math.round(y), Math.round(width), Math.round(height)])(layer.getBoundingClientRect()) : null,
    };
  });
  console.log("dom:", JSON.stringify(dom));
  await page.waitForTimeout(4000);
  const dom2 = await page.evaluate(() => {
    const el = document.querySelector(".dice-tray");
    return el ? { opacity: getComputedStyle(el).opacity, anims: el.getAnimations().map((a) => `${a.animationName ?? a.constructor.name}:${a.playState}@${Math.round(a.currentTime ?? -1)}`) } : null;
  });
  console.log("dom after 4s:", JSON.stringify(dom2));
  await page.screenshot({ path: "screenshots/live/dice-held.png", timeout: 15000 }).catch(() => {});
  if (held.settled !== 0) fail("held tray already settling — tumble started without a throw");

  // The throw — same call the tray click / R key makes. (If detection came
  // late the 10s auto-throw may have already cast it; both are valid ends,
  // and the settle/clear invariants are asserted from the transition log.)
  await page.evaluate(async () => {
    (await liveImport("/src/state/beats.ts")).throwDice();
  });
  await page.waitForTimeout(8000); // tumble + settle + hold + fade
}

// Race-free invariant from the transition log: a held tray NEVER shows a
// settled face while still held.
const log = await page.evaluate(() => window.__trayLog ?? []);
const violation = log.find((l) => l.includes("held=true") && !l.includes("settled=0"));
if (violation) fail(`held tray settled before its throw: ${violation}`);
if (!log.some((l) => l.includes("held=true"))) fail("no held tray ever appeared in the log");
if (!log.some((l) => l.includes(`settled=${held?.n ?? 99}`)))
  fail("the thrown dice never settled all faces");
if (!log.some((l) => l.endsWith(" null"))) fail("the tray never cleared");

const real = problems.filter((p) => !/Download the React DevTools|GPU stall|THREE\.Clock/.test(p));
if (real.length) {
  for (const p of real) console.error(" ", p);
  fail(`${real.length} errors`);
}
console.log("trayLog:", JSON.stringify(await page.evaluate(() => window.__trayLog ?? []), null, 1));
console.log(process.exitCode ? "DICE-THROW VERIFY FAILED" : "DICE-THROW VERIFY OK");
await browser.close();
