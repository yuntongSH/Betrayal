/**
 * Build the standalone, single-file game artifact:
 *
 *   artifact/src/template.html  (shell + CSS + DOM, with two placeholders)
 *   artifact/src/game.js        (vanilla three.js view + hotseat loop)
 *   packages/shared/src         (the real rules engine, bundled to one IIFE)
 *      ──►  artifact/dread-hollow.html   (open in any browser, no server)
 *
 * Run with: pnpm build:artifact
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const r = (...p) => resolve(root, ...p);

const result = await build({
  entryPoints: [r("packages/shared/src/index.ts")],
  bundle: true,
  format: "iife",
  globalName: "DH",
  platform: "browser",
  target: "es2020",
  minify: true,
  write: false,
});
const engine = result.outputFiles[0].text;

const template = readFileSync(r("artifact/src/template.html"), "utf8");
const game = readFileSync(r("artifact/src/game.js"), "utf8");

// Use function replacers so `$` sequences in the minified code aren't treated
// as special replacement patterns.
const out = template
  .replace("/*__ENGINE__*/", () => engine)
  .replace("/*__GAME__*/", () => game);

mkdirSync(r("artifact"), { recursive: true });
writeFileSync(r("artifact/dread-hollow.html"), out);
console.log(`Built artifact/dread-hollow.html (${out.length} bytes)`);
