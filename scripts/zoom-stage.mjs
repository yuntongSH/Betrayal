/** Tight, hi-dpi crops of the wardrobe stage for prop/face inspection. */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.ARTIFACT_URL ?? "http://localhost:8099/artifact/dread-hollow.html";
const outDir = resolve(root, "screenshots");
mkdirSync(outDir, { recursive: true });

const CHARS = process.argv.slice(2);
if (!CHARS.length) CHARS.push("crow", "tobias", "vance");
const ORDER = ["vance", "crow", "penny", "tobias", "odette", "thorne"];

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("pageerror:", e));
await page.goto(url, { waitUntil: "load" });
await page.waitForSelector("#solo-btn", { timeout: 20000 });
await page.evaluate(() => {
  window.__origNow = performance.now.bind(performance);
  window.__frozen = null;
  performance.now = () => window.__frozen ?? window.__origNow();
});

for (const id of CHARS) {
  const idx = ORDER.indexOf(id) + 1;
  await page.hover(`.char-grid .char-card:nth-child(${idx})`);
  await page.waitForTimeout(3800);
  for (const [tag, frac] of [["front", 0], ["quarter", 0.125]]) {
    await page.evaluate((f) => {
      const period = 4 * Math.PI * 1000;
      window.__frozen = (Math.ceil(window.__origNow() / period) + f) * period;
    }, frac);
    await page.waitForTimeout(350);
    await page.locator("#wardrobe-stage").screenshot({ path: resolve(outDir, `z-${id}-${tag}.png`) });
  }
  await page.evaluate(() => (window.__frozen = null));
  console.log(`captured z-${id}-front/quarter`);
}
await browser.close();
