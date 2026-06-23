/**
 * Render the standalone artifact in headless Chromium (software WebGL via
 * SwiftShader) and capture screenshots — the lobby and an in-game solo scene.
 *
 * Runs in CI (where a browser can be installed); see .github/workflows/
 * screenshots.yml. The artifact is fully client-side, so no game server is
 * needed — we just open the file and click "Play solo vs 3 bots".
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactUrl = "file://" + resolve(root, "artifact/dread-hollow.html");
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

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(artifactUrl, { waitUntil: "load" });
await page.waitForSelector("#solo-btn", { timeout: 20000 });
await page.screenshot({ path: resolve(outDir, "01-lobby.png") });
console.log("captured 01-lobby.png");

await page.click("#solo-btn");
await page.waitForSelector("#canvas-wrap canvas", { timeout: 30000 });
// give three.js (loaded from CDN) time to render and a couple of bot turns to play
await page.waitForTimeout(7000);
await page.screenshot({ path: resolve(outDir, "02-game.png") });
console.log("captured 02-game.png");

await browser.close();

if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Screenshots written to screenshots/");
