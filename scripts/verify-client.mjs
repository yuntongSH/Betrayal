/**
 * Headless verification of the React client (needs `pnpm dev` running):
 * lobby → solo room → character dossier panel → in-game board with rigged
 * avatars, keepsakes and voice log lines.
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "screenshots");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5173", { waitUntil: "load" });
await page.fill(".lobby input", "Verifier");
await page.click("text=Open a new manor");
await page.waitForSelector(".char-grid", { timeout: 15000 });

// Hover a card and capture the dossier panel.
await page.hover(".char-grid .char-card:nth-child(6)"); // Thorne
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(outDir, "c-room.png") });
console.log("captured c-room.png");

// Pick Tobias (lantern) and begin.
await page.click(".char-grid .char-card:nth-child(4)");
await page.waitForTimeout(600);
const begin = page.locator("text=Begin the descent");
await begin.waitFor({ timeout: 15000 });
await begin.click();
await page.waitForSelector("canvas", { timeout: 30000 });
await page.waitForTimeout(9000); // models load; a bot turn or two plays out
await page.screenshot({ path: resolve(outDir, "c-game.png") });
console.log("captured c-game.png");

await browser.close();
if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("done");
