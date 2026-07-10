/**
 * Smoke-test the VRM avatar pipeline headlessly: load the client with
 * ?vrm=default (viverse's bundled mannequin — the same code path a real .vrm
 * takes through loadCharacterModel/loadCharacterAnimation), start a solo
 * game, and assert the custom body actually mounted: the token's registry
 * handle is the VRM one (no-op reactions) and no errors fired.
 * Screenshots land in screenshots/live/.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "screenshots", "live");
mkdirSync(outDir, { recursive: true });

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
  if (m.type() === "error" || m.text().startsWith("[vrm]"))
    problems.push(`console: ${m.text().slice(0, 300)}`);
});
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};

await page.addInitScript(`window.liveImport = ${LIVE_IMPORT};`);
await page.goto("http://localhost:5173/?vrm=default", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore;
  st.getState().setName("VrmTester");
  st.getState().playSolo("VrmTester");
});
await page.waitForFunction(
  async () => !!(await liveImport("/src/state/store.ts")).useStore.getState().game,
  null,
  { timeout: 15000 },
);
console.log("game created with ?vrm=default");

// Wait for the avatar handle to register — the mannequin decode + retarget
// takes 5-30s under SwiftShader. Manual poll: Playwright's waitForFunction
// with interval polling destabilized the page (bisected 2026-07-10); a plain
// evaluate loop does not.
for (let waited = 0; waited < 180; waited += 3) {
  const ready = await page.evaluate(async () => {
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const reg = await liveImport("/src/three/avatarRegistry.ts");
    return !!(st.playerId && reg.avatarHandles.get(st.playerId));
  });
  if (ready) break;
  await page.waitForTimeout(3000);
}

const probe = await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore.getState();
  const reg = await liveImport("/src/three/avatarRegistry.ts");
  const handle = st.playerId ? reg.avatarHandles.get(st.playerId) : undefined;
  return {
    myId: st.playerId,
    hasHandle: !!handle,
    // The VRM handle's playOneShot is a no-op arrow — the Quaternius one is a
    // bound closure that reads clip tables; distinguish by source length.
    isVrmHandle: handle ? String(handle.playOneShot).length < 20 : false,
  };
});
console.log("probe:", JSON.stringify(probe));
console.log("vrmDebug:", JSON.stringify(await page.evaluate(() => window.__vrmDebug ?? [])));
console.log(
  "env:",
  JSON.stringify(
    await page.evaluate(async () => {
      const st = (await liveImport("/src/state/store.ts")).useStore.getState();
      const cfg = await liveImport("/src/three/vrmConfig.ts");
      const me = st.game?.players.find((p) => p.id === st.playerId);
      return {
        search: location.search,
        cfgUrl: cfg.myVrmUrl(),
        ls: localStorage.getItem("dh:vrm"),
        myChar: me?.characterId ?? null,
        alive: me?.alive,
        tokenChildren: await (async () => {
          const fc = await liveImport("/src/three/followCam.ts");
          const tok = st.playerId ? fc.trackedTokens.get(st.playerId) : null;
          const walkTree = (o, d = 0) =>
            d > 2 ? [] : [
              `${"  ".repeat(d)}${o.type}:${o.name || "?"}`,
              ...o.children.slice(0, 6).flatMap((c) => walkTree(c, d + 1)),
            ];
          return tok ? walkTree(tok.obj).slice(0, 20) : null;
        })(),
      };
    }),
  ),
);
if (!probe.hasHandle) fail("no avatar handle registered for my token — VRM body never mounted");
if (probe.hasHandle && !probe.isVrmHandle) fail("handle belongs to the default rig, not the VRM body");

// clear any card and zoom the moment before the shot so the body is visible
for (let i = 0; i < 6; i++) {
  await page.evaluate(async () => {
    const beats = await liveImport("/src/state/beats.ts");
    if (beats.useBeats.getState().active) beats.dismissActive();
  });
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/vrm-mannequin.png` });

const real = problems.filter((p) => !/Download the React DevTools|GPU stall|THREE\.Clock/.test(p));
if (real.length) {
  for (const p of real) console.error(" ", p);
  fail(`${real.length} errors`);
}
console.log(process.exitCode ? "VRM VERIFY FAILED" : "VRM VERIFY OK");
await browser.close();
