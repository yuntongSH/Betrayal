/** Diagnose: when does trackedTokens lose the player during explores? */
import { chromium } from "playwright";

const LIVE_IMPORT = `(path) => {
  const hit = performance.getEntriesByType("resource").map((e) => e.name)
    .filter((n) => n.includes(path) && n.includes("?t="))
    .sort((a, b) => b.length - a.length)[0];
  return import(hit || path);
}`;
const SHARED = "/@fs/Users/max/Betrayal/packages/shared/src/index.ts";

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200));
});
await page.addInitScript(
  `window.liveImport = ${LIVE_IMPORT};
   performance.setResourceTimingBufferSize(8000);
   try { localStorage.setItem("dh:view","first"); localStorage.setItem("dh:welcomed","1"); } catch {}`,
);
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const st = (await liveImport("/src/state/store.ts")).useStore;
  st.getState().setName("Diag");
  st.getState().playSolo("Diag");
});
let ready = false;
for (let i = 0; i < 40 && !ready; i++) {
  ready = await page.evaluate(async () => {
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const fc = await liveImport("/src/three/followCam.ts");
    return !!(st.playerId && st.game && fc.trackedTokens.get(st.playerId));
  });
  if (!ready) await page.waitForTimeout(1000);
}
console.log("ready:", ready);

async function probe(tag) {
  const p = await page.evaluate(async (sharedPath) => {
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const fc = await liveImport("/src/three/followCam.ts");
    const sh = await liveImport(sharedPath);
    const beats = await liveImport("/src/state/beats.ts");
    const g = st.game;
    const me = g?.players.find((pp) => pp.id === st.playerId);
    return {
      tracked: [...fc.trackedTokens.keys()],
      canvas: !!document.querySelector("canvas"),
      myLabelInDom: !!document.querySelector(".token-label.me"),
      pos: me?.position,
      roomId: me?.position ? g.house[me.position]?.roomId : null,
      phase: g?.phase,
      myTurn: g?.activePlayerId === st.playerId,
      moveLeft: g?.movementLeft,
      doors: st.playerId ? sh.legalMoves(g, st.playerId).doors : [],
      beatsActive: !!beats.useBeats.getState().active,
    };
  }, SHARED);
  console.log(tag, JSON.stringify(p));
  return p;
}

async function unblock() {
  await page.evaluate(async () => {
    const beats = await liveImport("/src/state/beats.ts");
    if (beats.useBeats.getState().active) beats.dismissActive();
    beats.throwDice();
    const st = (await liveImport("/src/state/store.ts")).useStore.getState();
    const b = beats.useBeats.getState();
    if (st.game?.haunt && b.hauntSeen !== st.game.haunt.id && !b.hauntCinematicHold)
      beats.markHauntSeen(st.game.haunt.id);
  });
}

// Explore repeatedly on our turns and probe after each action.
for (let round = 0; round < 12; round++) {
  // wait for my turn
  for (let i = 0; i < 60; i++) {
    await unblock();
    const p = await probe(`wait r${round}`);
    if (p.myTurn || p.phase === "ended") break;
    await page.waitForTimeout(1000);
  }
  const before = await probe(`before r${round}`);
  if (before.phase === "ended") break;
  if (!before.myTurn) continue;
  if (before.doors.length > 0) {
    await page.evaluate(async (d) => {
      (await liveImport("/src/state/store.ts")).useStore.getState().explore(d);
    }, before.doors[0]);
  } else {
    await page.evaluate(async () => {
      (await liveImport("/src/state/store.ts")).useStore.getState().endTurn();
    });
    await page.waitForTimeout(500);
    continue;
  }
  // settle: dismiss + wait walk
  for (let i = 0; i < 20; i++) {
    await unblock();
    await page.waitForTimeout(500);
  }
  const after = await probe(`after r${round}`);
  if (!after.tracked.length || !after.tracked.includes(await page.evaluate(async () => (await liveImport("/src/state/store.ts")).useStore.getState().playerId))) {
    console.log("TRACKING LOST at round", round, "room", after.roomId);
    // is the component mounted? does waiting bring it back?
    await page.waitForTimeout(5000);
    await probe("post-loss(+5s)");
    break;
  }
}
await browser.close();
