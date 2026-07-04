/**
 * Render the standalone artifact in headless Chromium (software WebGL via
 * SwiftShader) and capture screenshots — the lobby and an in-game solo scene.
 *
 * Runs in CI (where a browser can be installed); see .github/workflows/
 * screenshots.yml. The artifact is fully client-side, so no game server is
 * needed — but it is served over a local HTTP server rather than file://,
 * because the Fetch API refuses file:// URLs and the character glTF models
 * would silently fall back to primitive figures (and fail the error gate).
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, extname, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = resolve(root, "artifact");
const outDir = resolve(root, "screenshots");
mkdirSync(outDir, { recursive: true });

const MIME = {
  ".html": "text/html",
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".png": "image/png",
};
const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  const path = resolve(artifactDir, rel || "dread-hollow.html");
  if (!path.startsWith(artifactDir) || !existsSync(path)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const artifactUrl = `http://127.0.0.1:${server.address().port}/dread-hollow.html`;

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

await page.click("#solo-btn", { timeout: 60000 });
await page.waitForSelector("#canvas-wrap canvas", { timeout: 120000 });
// Software WebGL (SwiftShader) compiles the avatar shaders on the main thread —
// on a slow CI runner that can wedge the page for a while. Wait until frames
// are actually being produced again before the settle.
await page.waitForFunction(
  () =>
    new Promise((done) => {
      let n = 0;
      const tick = () => (++n >= 3 ? done(true) : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }),
  { timeout: 120000 },
);
// give three.js time to render and a couple of bot turns to play
await page.waitForTimeout(7000);
await page.screenshot({ path: resolve(outDir, "02-game.png") });
console.log("captured 02-game.png");

await browser.close();
server.close();

if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("Screenshots written to screenshots/");
