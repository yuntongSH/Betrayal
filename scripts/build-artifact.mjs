/**
 * Build the standalone, single-file game artifact:
 *
 *   artifact/src/template.html  (shell + CSS + DOM, with two placeholders)
 *   artifact/src/game.js        (vanilla three.js view + hotseat/bot loop,
 *                                importing @dread-hollow/decor)
 *   packages/shared/src         (the real rules engine, bundled to one IIFE)
 *      ──►  artifact/dread-hollow.html   (open in any browser, no server)
 *
 * three.js is kept external and loaded from a CDN via the page's import map.
 * Run with: pnpm build:artifact
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const r = (...p) => resolve(root, ...p);

// 1. The rules engine -> a single IIFE exposing `window.DH`.
const engineOut = await build({
  entryPoints: [r("packages/shared/src/index.ts")],
  bundle: true,
  format: "iife",
  globalName: "DH",
  platform: "browser",
  target: "es2020",
  minify: true,
  write: false,
});
const engine = engineOut.outputFiles[0].text;

// 2. The game view + @dread-hollow/decor -> one ESM module, three external.
const gameOut = await build({
  entryPoints: [r("artifact/src/game.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  external: ["three", "three/addons/*"],
  write: false,
});
const game = gameOut.outputFiles[0].text;

const template = readFileSync(r("artifact/src/template.html"), "utf8");

// Function replacers so `$` sequences in the minified code aren't treated
// as special replacement patterns.
const out = template
  .replace("/*__ENGINE__*/", () => engine)
  .replace("/*__GAME__*/", () => game);

mkdirSync(r("artifact"), { recursive: true });
writeFileSync(r("artifact/dread-hollow.html"), out);
console.log(`Built artifact/dread-hollow.html (${out.length} bytes)`);
