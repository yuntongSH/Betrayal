# Standalone artifact

[`dread-hollow.html`](dread-hollow.html) is a **single, self-contained file** —
open it in any modern browser and play. No install, no build, no server.

- **Mode:** pass-and-play (hotseat) on one device. Pick a party of explorers,
  then take turns on the shared screen.
- **Engine:** the *real* `@dread-hollow/shared` rules engine, bundled in — so the
  rules match the full app and its tests exactly.
- **3D:** vanilla three.js loaded from a CDN (so the file needs internet to run,
  but is otherwise completely standalone).

> For full **online multiplayer**, run the server + client apps — see the
> repository [README](../README.md).

## How it's built

```
artifact/src/template.html   shell: import-map, CSS, lobby + HUD DOM
artifact/src/game.js         vanilla three.js scene + hotseat game loop
packages/shared/src          the rules engine (bundled to one IIFE: window.DH)
        │
        └─ scripts/build-artifact.mjs ──►  artifact/dread-hollow.html
```

Regenerate after changing the engine or the sources:

```bash
pnpm build:artifact
```
