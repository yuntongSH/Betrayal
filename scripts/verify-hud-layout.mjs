/**
 * Headless verification of the HUD layout pass (needs `pnpm dev` running).
 *
 * Guards three regressions that were live in the React client:
 *  1. the right rail was two independently-anchored absolute stacks (cards from
 *     the top, minimap from the bottom) that overlapped on ordinary laptop
 *     viewports, burying the inventory's use/give buttons and the haunt goal;
 *  2. drei <Html> room/player labels (z-index ~16.7M) painted over the HUD
 *     because the `isolation: isolate` guard sat on a layer the labels are not
 *     inside — they portal into a *sibling* of the canvas's parent;
 *  3. the two-line guide strip overran the party roster's first row.
 *
 * Each check is structural, so it holds whatever the room description says.
 * Usage: node scripts/verify-hud-layout.mjs
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
// A deliberately ordinary laptop viewport — the size the overlap showed up at.
const page = await browser.newPage({ viewport: { width: 1468, height: 775 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5173", { waitUntil: "load" });
await page.fill(".lobby input", "Verifier");
await page.click("text=Play solo vs 3 bots");
await page.waitForSelector(".hud-right", { timeout: 30000 });
await page.waitForSelector(".minimap", { timeout: 30000 });
// Dismiss the first-night welcome so the HUD is actually on screen.
await page.click("text=Enter the manor").catch(() => {});
await page.waitForTimeout(2500);

const failures = [];
const note = (ok, label, detail) => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

// --- 1. one rail, one height budget ---------------------------------------
const rail = await page.evaluate(() => {
  const r = document.querySelector(".hud-right");
  const scroll = document.querySelector(".hud-right-scroll");
  const map = document.querySelector(".minimap");
  const box = (e) => (e ? e.getBoundingClientRect() : null);
  const trait = document.querySelector(".trait-panel");
  const rb = box(r), sb = box(scroll), mb = box(map), tb = box(trait);
  return {
    minimapInsideRail: !!(r && map && r.contains(map)),
    traitPinned: trait ? !scroll.contains(trait) : false,
    scrollOverflow: scroll ? getComputedStyle(scroll).overflowY : null,
    railBottom: rb && Math.round(rb.bottom),
    scrollBottom: sb && Math.round(sb.bottom),
    traitTop: tb && Math.round(tb.top),
    traitBottom: tb && Math.round(tb.bottom),
    minimapTop: mb && Math.round(mb.top),
    railWithinViewport: rb ? rb.bottom <= innerHeight + 1 : false,
  };
});
note(rail.traitPinned, "the player's own panel is pinned, not inside the scrollport");
note(rail.minimapInsideRail, "minimap is a child of the right rail");
note(rail.scrollOverflow === "auto", "room card scrolls internally", `overflow-y: ${rail.scrollOverflow}`);
note(
  rail.scrollBottom <= rail.traitTop + 1,
  "room card ends above the trait panel",
  `card ends ${rail.scrollBottom}px, panel starts ${rail.traitTop}px`,
);
note(
  rail.traitBottom <= rail.minimapTop + 1,
  "trait panel ends above the minimap",
  `panel ends ${rail.traitBottom}px, map starts ${rail.minimapTop}px`,
);
note(rail.railWithinViewport, "rail stays inside the viewport", `bottom ${rail.railBottom}px of ${775}`);

// Stress it: an over-tall card stack must absorb the growth into its own
// scrollport instead of pushing content down behind the map. (Measure the
// scrollport's box, not its children's — an overflowing child's rect extends
// past the clip and would report a false overlap.)
const stressed = await page.evaluate(() => {
  const scroll = document.querySelector(".hud-right-scroll");
  const filler = document.createElement("div");
  filler.style.cssText = "height:1200px;flex:0 0 auto";
  scroll.prepend(filler);
  const map = document.querySelector(".minimap").getBoundingClientRect();
  const trait = document.querySelector(".trait-panel").getBoundingClientRect();
  const sb = scroll.getBoundingClientRect();
  const out = {
    scrollable: scroll.scrollHeight > scroll.clientHeight,
    scrollBottom: Math.round(sb.bottom),
    traitTop: Math.round(trait.top),
    traitHeight: Math.round(trait.height),
    mapTop: Math.round(map.top),
    mapFullyVisible: map.bottom <= innerHeight + 1 && map.top >= 0,
  };
  filler.remove();
  return out;
});
note(stressed.scrollable, "an over-long room description becomes scrollable rather than clipped");
note(
  stressed.scrollBottom <= stressed.traitTop + 1,
  "it still ends above the player's own panel",
  `card ends ${stressed.scrollBottom}px, panel starts ${stressed.traitTop}px`,
);
note(
  stressed.traitHeight > 100,
  "the player's own panel keeps its height under stress",
  `${stressed.traitHeight}px tall`,
);
note(stressed.mapFullyVisible, "the minimap stays fully on screen under stress");

// The real-world case that broke: carrying an item grows the trait panel by the
// inventory row plus its use/give buttons. That has to stay on screen, unscrolled,
// on an ordinary laptop — hidden behind the map was the original defect.
const withItem = await page.evaluate(() => {
  const inv = document.querySelector(".tp-inv");
  if (!inv) return { found: false };
  // Simulate a held item: one row, a description line, and the action buttons.
  const li = document.createElement("li");
  li.className = "inv-li __probe";
  li.innerHTML =
    '<div class="inv-row"><span class="inv-icon">\u{1F5DD}</span>' +
    '<span class="inv-name">Iron Key</span>' +
    '<button class="give-btn use">use</button>' +
    '<span class="inv-give"><button class="give-btn">→ Vance</button></span></div>' +
    '<div class="inv-desc muted small">Cold and far too heavy for its size. It fits something important.</div>';
  let ul = inv.querySelector("ul");
  if (!ul) { ul = document.createElement("ul"); inv.appendChild(ul); }
  ul.appendChild(li);
  const panel = document.querySelector(".trait-panel");
  const map = document.querySelector(".minimap").getBoundingClientRect();
  const b = li.getBoundingClientRect();
  const pb = panel.getBoundingClientRect();
  const out = {
    found: true,
    panelScrolls: panel.scrollHeight > panel.clientHeight + 1,
    itemVisible: b.top >= pb.top - 1 && b.bottom <= pb.bottom + 1,
    behindMap: b.bottom > map.top && b.right > map.left && b.top < map.bottom,
    itemBottom: Math.round(b.bottom),
    panelBottom: Math.round(pb.bottom),
    mapTop: Math.round(map.top),
  };
  li.remove();
  return out;
});
if (!withItem.found) {
  note(false, "a .tp-inv inventory section exists to test");
} else {
  note(!withItem.behindMap, "a held item is never behind the minimap");
  note(
    withItem.itemVisible,
    "a held item, with its use/give buttons, is reachable inside the panel",
    `item ends ${withItem.itemBottom}px, panel ends ${withItem.panelBottom}px, map starts ${withItem.mapTop}px`,
  );
  // Informational: at 775px of content height the panel may scroll a little.
  // That is the designed fallback — the defect was content being *hidden*.
  console.log(
    `  ..  at ${775}px viewport the panel ${withItem.panelScrolls ? "scrolls internally" : "fits outright"}`,
  );
}

// --- 2. 3D labels can't paint over the HUD --------------------------------
// Room labels only mount once the scene has rooms on screen; give them time.
await page.waitForSelector(".room-label", { timeout: 20000 }).catch(() => {});
const labels = await page.evaluate(() => {
  const shell = document.querySelector(".game-shell");
  // The thing that actually has to be trapped is drei's portal layer — the
  // element carrying the enormous inline z-index. Find it by that signature so
  // the check holds even if no .room-label happens to be mounted.
  const portal = [...shell.querySelectorAll("div")].find(
    (d) => Number(getComputedStyle(d).zIndex) > 10000,
  );
  const lbl = document.querySelector(".room-label");
  const probe = lbl ?? portal;
  if (!probe) return { found: false };
  let n = probe, isolatedAncestor = null;
  while (n && n !== shell) {
    if (getComputedStyle(n).isolation === "isolate") isolatedAncestor = n;
    n = n.parentElement;
  }
  const hud = document.querySelector(".hud-right");
  return {
    found: true,
    via: lbl ? ".room-label" : "portal layer",
    portalZ: portal ? getComputedStyle(portal).zIndex : "none",
    trapped: !!isolatedAncestor,
    isolatedIsCanvasRoot: !!isolatedAncestor?.querySelector("canvas"),
    hudNotInsideIsolated: isolatedAncestor ? !isolatedAncestor.contains(hud) : null,
  };
});
if (!labels.found) {
  note(false, "a label or portal layer exists to test");
} else {
  note(labels.trapped, `label z-index is trapped in an isolated stacking context`, `via ${labels.via}, z-index ${labels.portalZ}`);
  note(labels.isolatedIsCanvasRoot, "the isolated layer is the canvas root (holds canvas + label portal)");
  note(labels.hudNotInsideIsolated, "the HUD sits outside that layer, so it paints above");
}

// --- 3. the guide strip no longer overruns the roster ---------------------
const top = await page.evaluate(() => {
  const g = document.querySelector(".guide-strip");
  const roster = document.querySelector(".party-roster");
  const toggles = document.querySelector(".hud-top-right");
  const railEl = document.querySelector(".hud-right");
  const b = (e) => (e ? e.getBoundingClientRect() : null);
  const gb = b(g), rb = b(roster), tb = b(toggles), xb = b(railEl);
  return {
    guideBottom: gb && Math.round(gb.bottom),
    rosterTop: rb && Math.round(rb.top),
    lineClamp: g ? getComputedStyle(g).webkitLineClamp : null,
    togglesBottom: tb && Math.round(tb.bottom),
    railTop: xb && Math.round(xb.top),
  };
});
note(
  top.guideBottom <= top.rosterTop,
  "guide strip clears the party roster",
  `guide ends ${top.guideBottom}px, roster starts ${top.rosterTop}px`,
);
note(top.lineClamp === "2", "guide strip is clamped to two lines", `line-clamp: ${top.lineClamp}`);
note(
  top.togglesBottom <= top.railTop,
  "top-bar toggles clear the right rail",
  `toggles end ${top.togglesBottom}px, rail starts ${top.railTop}px`,
);

await page.screenshot({ path: resolve(outDir, "hud-layout.png") });
console.log("\ncaptured screenshots/hud-layout.png");

// --- 4. given ordinary room, nothing scrolls at all -----------------------
// 900px of content height is a common laptop browser; there the whole rail
// (room card, panel, a held item, map) must fit outright.
await page.setViewportSize({ width: 1512, height: 900 });
await page.waitForTimeout(700);
const roomy = await page.evaluate(() => {
  const inv = document.querySelector(".tp-inv");
  const ul = inv.querySelector("ul") ?? inv.appendChild(document.createElement("ul"));
  const li = document.createElement("li");
  li.className = "inv-li";
  li.innerHTML =
    '<div class="inv-row"><span class="inv-icon">\u{1F5DD}</span><span class="inv-name">Iron Key</span>' +
    '<button class="give-btn use">use</button></div>' +
    '<div class="inv-desc muted small">Cold and far too heavy for its size. It fits something important.</div>';
  ul.appendChild(li);
  const scroll = document.querySelector(".hud-right-scroll");
  const panel = document.querySelector(".trait-panel");
  const map = document.querySelector(".minimap").getBoundingClientRect();
  const out = {
    cardScrolls: scroll.scrollHeight > scroll.clientHeight + 1,
    panelScrolls: panel.scrollHeight > panel.clientHeight + 1,
    mapOnScreen: map.bottom <= innerHeight + 1,
  };
  li.remove();
  return out;
});
note(!roomy.cardScrolls, "at 900px the room card fits without scrolling");
note(!roomy.panelScrolls, "at 900px the panel with a held item fits without scrolling");
note(roomy.mapOnScreen, "at 900px the minimap is fully on screen");
await page.screenshot({ path: resolve(outDir, "hud-layout-900.png") });
console.log("captured screenshots/hud-layout-900.png");

const realErrors = errors.filter((e) => !/deprecated|PCFSoftShadowMap|THREE\.Clock/i.test(e));
if (realErrors.length) {
  console.log(`\nconsole errors:\n${realErrors.map((e) => `  ${e.slice(0, 160)}`).join("\n")}`);
  failures.push("console errors");
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nall HUD layout checks passed");
