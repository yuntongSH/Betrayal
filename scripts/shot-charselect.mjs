/**
 * Screenshot the character-select (intake slips): open a manor, add a bot
 * (so a CLAIMED stamp shows), pick a character (wax seal), shoot the board
 * and a hover state.
 */
import { chromium } from "playwright";

const OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.error("pageerror:", e.message.slice(0, 200)));

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

await page.fill('input[placeholder="e.g. Eleanor"]', "Max");
await page.click('text=Open a new manor');
await page.waitForTimeout(1800);

// bot claims a slip
const addBot = page.locator("text=+ Add bot");
if (await addBot.count()) {
  await addBot.click();
  await page.waitForTimeout(900);
}

await page.screenshot({ path: `${OUT}/cards-1-board.png` });

// pick the monk (unclaimed hopefully mid-grid) — click the 4th slip if free
const cards = page.locator(".char-card:not(.taken)");
await cards.nth(2).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/cards-2-picked.png` });

// hover a different slip for the lift + dossier swap
await cards.nth(0).hover();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/cards-3-hover.png` });

// narrow viewport sanity
await page.setViewportSize({ width: 760, height: 900 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/cards-4-narrow.png` });

await browser.close();
console.log("done");
