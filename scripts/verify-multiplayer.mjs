/**
 * Two headless clients share one manor: page A opens a room, page B joins by
 * code, both pick characters, A starts. Asserts server-authoritative sync —
 * same room, same growing log on both clients, bots taking turns — and that
 * both 3D frontends boot. Manual evaluate polls only (interval-polled
 * waitForFunction destabilizes the page under SwiftShader).
 */
import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});

const problems = [];
const mkPage = async (tag) => {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on("pageerror", (e) => problems.push(`${tag} pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`${tag} console: ${m.text().slice(0, 200)}`);
  });
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  return page;
};
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};
const poll = async (page, fn, timeoutMs = 30000, every = 800) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await page.evaluate(fn);
    if (v) return v;
    await page.waitForTimeout(every);
  }
  return null;
};

const A = await mkPage("A");
const B = await mkPage("B");

await A.evaluate(async () => {
  const st = (await import("/src/state/store.ts")).useStore.getState();
  st.setName("Host");
  st.createRoom("Host");
});
const code = await poll(A, async () => (await import("/src/state/store.ts")).useStore.getState().roomCode);
if (!code) {
  fail("room never created");
  process.exit(1);
}
console.log(`room ${code} created`);

await A.evaluate(async () => {
  (await import("/src/state/store.ts")).useStore.getState().chooseCharacter("thorne");
});
await B.evaluate(async (c) => {
  const st = (await import("/src/state/store.ts")).useStore.getState();
  st.setName("Guest");
  st.joinRoom(c, "Guest");
}, code);
const joined = await poll(B, async () => {
  const st = (await import("/src/state/store.ts")).useStore.getState();
  return st.roomCode && st.playerId ? st.roomCode : null;
});
if (joined !== code) fail(`guest joined "${joined}" instead of "${code}"`);
await B.evaluate(async () => {
  (await import("/src/state/store.ts")).useStore.getState().chooseCharacter("vance");
});
await A.waitForTimeout(800);
await A.evaluate(async () => {
  (await import("/src/state/store.ts")).useStore.getState().startGame();
});

const started = await Promise.all(
  [A, B].map((p) =>
    poll(p, async () => {
      const g = (await import("/src/state/store.ts")).useStore.getState().game;
      return g && g.phase !== "lobby" ? g.phase : null;
    }),
  ),
);
console.log(`phases after start: A=${started[0]} B=${started[1]}`);
if (!started[0] || !started[1]) fail("game did not start on both clients");

// Both worlds must actually run (frame loops boot).
for (const [tag, p] of [["A", A], ["B", B]]) {
  const ticks = await p.evaluate(async () => {
    const t0 = window.__dreadPerf?.ticks ?? 0;
    await new Promise((r) => setTimeout(r, 1200));
    return (window.__dreadPerf?.ticks ?? 0) - t0;
  });
  console.log(`${tag}: ${ticks} ticks/1.2s`);
  if (ticks < 1) fail(`${tag}: frame loop not ticking`);
}

// Server-authoritative sync: the log grows on BOTH clients and stays equal.
const logLen = (p) =>
  p.evaluate(async () => (await import("/src/state/store.ts")).useStore.getState().game?.log.length ?? -1);
const a0 = await logLen(A);
const b0 = await logLen(B);
// Humans hold the turn until they act — both clients end their turns so the
// bot gets to play, then the server clock drives everyone.
for (let i = 0; i < 6; i++) {
  for (const p of [A, B]) {
    await p.evaluate(async () => {
      const st = (await import("/src/state/store.ts")).useStore.getState();
      const beats = await import("/src/state/beats.ts");
      if (beats.useBeats.getState().active) beats.dismissActive();
      const g = st.game;
      if (g && g.phase === "explore" && g.activePlayerId === st.playerId) st.endTurn();
    });
  }
  await A.waitForTimeout(2500);
}
const a1 = await logLen(A);
const b1 = await logLen(B);
console.log(`log length: A ${a0}→${a1} · B ${b0}→${b1}`);
if (a1 <= a0) fail("host log never advanced (bots idle?)");
if (Math.abs(a1 - b1) > 3) fail(`clients diverged: A=${a1} B=${b1}`);

await A.screenshot({ path: "screenshots/live/multiplayer-host.png", timeout: 15000 }).catch(() => {});
await B.screenshot({ path: "screenshots/live/multiplayer-guest.png", timeout: 15000 }).catch(() => {});

const real = problems.filter((p) => !/Download the React DevTools|GPU stall|THREE\.Clock/.test(p));
if (real.length) {
  for (const p of real) console.error(" ", p);
  fail(`${real.length} errors`);
}
console.log(process.exitCode ? "MULTIPLAYER VERIFY FAILED" : "MULTIPLAYER VERIFY OK");
await browser.close();
