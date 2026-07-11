/**
 * Onboarding, verified headlessly: a fresh player sees the welcome card once
 * (and never again after dismissing), and the guide strip always carries a
 * phase-appropriate instruction — explore text with steps-left on their turn,
 * omen-count status while others play. Screenshots for eyes-on review.
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

await page.addInitScript(`window.liveImport = ${LIVE_IMPORT};`);
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore;
  st.getState().setName("Newcomer");
  st.getState().playSolo("Newcomer");
});
await page.waitForTimeout(5000);

// 1. fresh player → welcome card up
const welcome = await page.evaluate(() => document.querySelector(".welcome-card")?.textContent?.slice(0, 40) ?? null);
console.log("welcome card:", welcome ? "shown" : "MISSING");
if (!welcome) fail("welcome card did not show for a fresh player");
await page.screenshot({ path: "screenshots/live/welcome-card.png", timeout: 15000 }).catch(() => {});

// 2. dismiss → flag set, card gone
await page.evaluate(() => {
  [...document.querySelectorAll(".welcome-card button")].find((b) => b.textContent.includes("Enter"))?.click();
});
await page.waitForTimeout(500);
const after = await page.evaluate(() => ({
  gone: !document.querySelector(".welcome-card"),
  flag: localStorage.getItem("dh:welcomed"),
}));
if (!after.gone || after.flag !== "1") fail(`dismiss broken (${JSON.stringify(after)})`);

// 3. guide strip present and phase-appropriate over a minute of play
let sawMyTurnText = false;
let sawWaitText = false;
const t0 = Date.now();
while (Date.now() - t0 < 60000 && !(sawMyTurnText && sawWaitText)) {
  const s = await page.evaluate(async () => {
    const beats = await liveImport("/src/state/beats.ts");
    if (beats.useBeats.getState().active) beats.dismissActive();
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const g = st.game;
    const strip = document.querySelector(".guide-strip")?.textContent ?? "";
    const mine = g && g.activePlayerId === st.playerId;
    // hand the turn over once we've seen our text so the wait text can appear
    if (mine && g.phase === "explore" && /steps? left|Out of steps/.test(strip)) {
      st.endTurn();
      return { mine: true, strip };
    }
    return { mine, strip };
  });
  if (s.mine && /steps? left|Out of steps/.test(s.strip)) sawMyTurnText = true;
  if (!s.mine && /omens? in play|no omens in play/.test(s.strip)) sawWaitText = true;
  await page.waitForTimeout(800);
}
console.log(`guide strip: myTurn=${sawMyTurnText} waiting=${sawWaitText}`);
if (!sawMyTurnText) fail("guide strip never showed the explore instruction on my turn");
if (!sawWaitText) fail("guide strip never showed the omen status while waiting");
await page.screenshot({ path: "screenshots/live/guide-strip.png", timeout: 15000 }).catch(() => {});

// 4. reload → welcomed flag suppresses the card
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore;
  st.getState().setName("Newcomer");
  st.getState().playSolo("Newcomer");
});
await page.waitForTimeout(4000);
const second = await page.evaluate(() => !!document.querySelector(".welcome-card"));
if (second) fail("welcome card reappeared for a welcomed player");

const real = problems.filter((p) => !/Download the React DevTools|GPU stall|THREE\.Clock/.test(p));
if (real.length) {
  for (const p of real) console.error(" ", p);
  fail(`${real.length} errors`);
}
console.log(process.exitCode ? "GUIDE VERIFY FAILED" : "GUIDE VERIFY OK");
await browser.close();
