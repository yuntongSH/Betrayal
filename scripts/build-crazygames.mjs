/**
 * Build the CrazyGames submission package.
 *
 *   node scripts/build-crazygames.mjs
 *   CG_SERVER_URL=wss://my-app.fly.dev node scripts/build-crazygames.mjs
 *
 * Produces dread-hollow-crazygames.zip at the repo root: the client built
 * with the SDK enabled (VITE_CRAZYGAMES=1), pointed at the hosted
 * multiplayer server, and with relative asset paths (the portal serves the
 * bundle from its own CDN path). Checks the portal's published limits.
 */
import { execSync } from "node:child_process";
import { readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "apps/client/dist");
const zipPath = join(root, "dread-hollow-crazygames.zip");
const serverUrl = process.env.CG_SERVER_URL ?? "wss://dread-hollow.fly.dev";

console.log(`building client for CrazyGames (server: ${serverUrl})…`);
execSync("pnpm --filter @dread-hollow/client exec vite build --base=./", {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_CRAZYGAMES: "1",
    VITE_SERVER_URL: serverUrl,
  },
});

// CrazyGames limits: total ≤ 250MB, ≤ 1500 files (initial download ≤ 50MB —
// the three.js/models split keeps the first paint well under that).
let files = 0;
let bytes = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else {
      files++;
      bytes += st.size;
    }
  }
};
walk(dist);
const mb = (bytes / 1024 / 1024).toFixed(1);
console.log(`dist: ${files} files, ${mb} MB`);
if (files > 1500) throw new Error(`too many files for CrazyGames (${files} > 1500)`);
if (bytes > 250 * 1024 * 1024) throw new Error(`bundle too large for CrazyGames (${mb} MB > 250 MB)`);

if (existsSync(zipPath)) rmSync(zipPath);
execSync(`zip -qr ${JSON.stringify(zipPath)} .`, { cwd: dist, stdio: "inherit" });
console.log(`\n✅ ${zipPath}`);
console.log("upload at https://developer.crazygames.com → Submit game (HTML5 zip)");
