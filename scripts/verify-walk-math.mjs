/**
 * Deterministic unit check of the walking math — no browser, no frame-rate
 * noise. Bundles apps/client/src/three/walk.ts and asserts:
 *   1. adjacent-room routes are `crossing` (jog), in-room shuffles are not;
 *   2. a crossing path followed at 60 fps reaches jog pace (> 4 u/s) mid-way
 *      and still settles into the target slot;
 *   3. the facing gate throttles ground covered at launch;
 *   4. an in-room walking route never exceeds walk pace.
 */
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(mkdtempSync(join(tmpdir(), "walkmath-")), "walk.mjs");
await build({
  stdin: {
    contents: 'export * from "./src/three/walk"; export { Vector3 } from "three";',
    resolveDir: join(root, "apps", "client"),
  },
  bundle: true,
  format: "esm",
  outfile: out,
  logLevel: "silent",
});
const { buildWalkPath, followPath, WALK_SPEED, RUN_SPEED, Vector3 } = await import(
  pathToFileURL(out).href
);

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed = 1;
};

// 1. crossing semantics
const A = "ground:0:0";
const B = "ground:1:0";
const cross = buildWalkPath(A, [1.6, 0, 0], B, [7 - 1.6, 0, 0]);
check("adjacent rooms build a crossing route", !!cross && cross.crossing === true);
const shuffle = buildWalkPath(A, [1.6, 0, 0], A, [-1.6, 0, 0.2]);
check("in-room re-shuffle is not crossing", !shuffle || shuffle.crossing === false);

// 2. crossing path reaches jog pace and arrives on the slot
if (cross) {
  const dt = 1 / 60;
  const pos = new Vector3(1.6, 0, 0);
  const cur = { i: 0, traveled: 0 };
  const prev = pos.clone();
  let top = 0;
  let arrived = false;
  let frames = 0;
  for (let k = 0; k < 60 * 30; k++) {
    prev.copy(pos);
    const more = followPath(pos, cross.points, cur, dt, RUN_SPEED, 1);
    top = Math.max(top, pos.distanceTo(prev) / dt);
    frames++;
    if (!more) {
      arrived = true;
      break;
    }
  }
  check("crossing route reaches jog pace", top > 4.0, `top ${top.toFixed(2)} u/s`);
  check("crossing route arrives", arrived, `${frames} frames (${(frames / 60).toFixed(2)}s)`);
  const end = cross.points[cross.points.length - 1];
  check("arrival lands on the slot", Math.hypot(pos.x - end[0], pos.z - end[2]) < 1e-6);
}

// 3. the facing gate throttles ground covered at launch
if (cross) {
  const dt = 1 / 60;
  const free = { pos: new Vector3(1.6, 0, 0), c: { i: 0, traveled: 0 } };
  const gated = { pos: new Vector3(1.6, 0, 0), c: { i: 0, traveled: 0 } };
  for (let k = 0; k < 30; k++) {
    followPath(free.pos, cross.points, free.c, dt, RUN_SPEED, 1);
    followPath(gated.pos, cross.points, gated.c, dt, RUN_SPEED, 0.12);
  }
  check(
    "facing gate throttles the launch",
    gated.c.traveled < free.c.traveled * 0.25,
    `gated ${gated.c.traveled.toFixed(2)}u vs free ${free.c.traveled.toFixed(2)}u over 0.5s`,
  );
}

// 4. in-room walking route never exceeds walk pace
if (shuffle) {
  const dt = 1 / 60;
  const pos = new Vector3(1.6, 0, 0);
  const c = { i: 0, traveled: 0 };
  const prev = pos.clone();
  let top = 0;
  for (let k = 0; k < 60 * 30; k++) {
    prev.copy(pos);
    if (!followPath(pos, shuffle.points, c, dt, WALK_SPEED, 1)) break;
    top = Math.max(top, pos.distanceTo(prev) / dt);
  }
  check("in-room shuffle stays at walk pace", top <= WALK_SPEED + 1e-6, `top ${top.toFixed(2)} u/s`);
}

process.exit(failed);
