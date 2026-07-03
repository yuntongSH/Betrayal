/**
 * Character-work verification: render the artifact over HTTP (so the glTF
 * bodies load), capture the wardrobe dossier + front-facing model for every
 * explorer, a mid-wave greeting frame, an in-game scene, and a forced death
 * (fallen body + last-words log). Serve first:  python3 -m http.server 8099
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.ARTIFACT_URL ?? "http://localhost:8099/artifact/dread-hollow.html";
const outDir = resolve(root, "screenshots");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
    "--no-sandbox",
  ],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "load" });
await page.waitForSelector("#solo-btn", { timeout: 20000 });

// A controllable clock: freeze performance.now at a multiple of the wardrobe's
// full-turn period (4π s) to catch the model exactly front-facing.
await page.evaluate(() => {
  window.__origNow = performance.now.bind(performance);
  window.__frozen = null;
  performance.now = () => window.__frozen ?? window.__origNow();
});
const freezeFront = () =>
  page.evaluate(() => {
    const period = 4 * Math.PI * 1000;
    window.__frozen = Math.ceil(window.__origNow() / period) * period;
  });
const unfreeze = () => page.evaluate(() => (window.__frozen = null));

const CHARS = ["vance", "crow", "penny", "tobias", "odette", "thorne"];
for (let i = 0; i < CHARS.length; i++) {
  await page.hover(`.char-grid .char-card:nth-child(${i + 1})`);
  if (i === 0) {
    // Catch the greeting mid-wave on the first character.
    await page.waitForTimeout(1600);
    await page.locator("#wardrobe").screenshot({ path: resolve(outDir, `w-${CHARS[i]}-wave.png`) });
  }
  await page.waitForTimeout(3800); // model load + wave settles into idle
  await freezeFront();
  await page.waitForTimeout(400); // let a frame render at the frozen time
  await page.locator("#wardrobe").screenshot({ path: resolve(outDir, `w-${CHARS[i]}.png`) });
  await unfreeze();
  console.log(`captured w-${CHARS[i]}.png`);
}

// Everyone into the party, then the in-game scene.
for (let i = 0; i < CHARS.length; i++) await page.click(`.char-grid .char-card:nth-child(${i + 1})`);
await page.click("#begin-btn");
await page.waitForSelector("#canvas-wrap canvas", { timeout: 30000 });
await page.waitForTimeout(6000); // a couple of bot turns; tokens glide/walk
await page.screenshot({ path: resolve(outDir, "g-board.png") });
console.log("captured g-board.png");

// Force a death and confirm the body stays, the label flips, the voice logs.
const deathInfo = await page.evaluate(() => {
  const s = window.__dh.state;
  const victim = s.players.find((p) => p.id !== s.activePlayerId) ?? s.players[0];
  window.DH.modTrait(s, victim, "might", -99);
  window.__dh.render();
  return {
    victim: victim.name,
    alive: victim.alive,
    lastVoice: s.log.filter((l) => l.kind === "voice").map((l) => l.text).pop() ?? null,
  };
});
console.log("death check:", JSON.stringify(deathInfo));
await page.waitForTimeout(2500); // death clip plays + clamps
await page.screenshot({ path: resolve(outDir, "g-death.png") });
console.log("captured g-death.png");

await browser.close();
if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("done");
