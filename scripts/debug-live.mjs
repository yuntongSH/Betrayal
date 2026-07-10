import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 400)));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    console.log(`[${m.type()}]`, m.text().slice(0, 250));
});
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const st = (await import("/src/state/store.ts")).useStore;
  st.getState().setName("Debug");
  st.getState().playSolo("Debug");
});
await page.waitForTimeout(6000);
const info = await page.evaluate(() => ({
  canvases: [...document.querySelectorAll("canvas")].map((c) => [c.width, c.height]),
  perf: window.__dreadPerf ? { ticks: window.__dreadPerf.ticks } : null,
  vis: document.visibilityState,
}));
console.log("info:", JSON.stringify(info));
await page.screenshot({ path: "screenshots/live/debug-state.png" });
await browser.close();
