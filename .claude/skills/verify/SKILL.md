---
name: verify
description: Use this skill to verify testing the front end whenever you make changes to it. Use it aggressively any time you touch relevant code.
---

# Verify the front end

Run this after any change to the client (`apps/client`), the server
(`packages/server`), the rules engine (`packages/shared`), or the standalone
artifact (`artifact/`).

## Steps

1. **Start the app (frontend + backend):**
   ```bash
   pnpm dev
   ```
   This runs the WebSocket server on **ws://localhost:8787** and the Vite client
   on **http://localhost:5173**. (This project's client is on **5173**, not 3000.)

2. **Wait for the health checks:**
   - server: `curl -fs http://localhost:8787/health` returns `ok`
   - client: `curl -fs http://localhost:5173/` returns the app HTML

3. **Open the client with the Claude Chrome MCP** at **http://localhost:5173**.

4. **Test all relevant features of the code we've touched so far and $ARGUMENTS.**
   Cover the loop end-to-end:
   - lobby → pick a character, **"Play solo vs 3 bots"**, or **"Add bot"**
   - start → explore (click glowing rooms / flame arrows) → draw cards
   - the **haunt** reveal → combat (click monsters, attack rivals) → a winner
   - multiplayer: open a second tab and **join with the room code**; confirm both
     tabs stay in sync and bots take their turns automatically

5. **If needed, correlate behaviour with logging:** the in-game **Chronicle**
   panel, the browser console, and the server's stdout.

## Always run the headless checks too

```bash
pnpm typecheck && pnpm test && pnpm build
```

## Blocker fallback (no browser / headless environment)

If the Claude Chrome MCP or a WebGL-capable browser isn't available (CI, a remote
sandbox), verify the logic headlessly — this has caught real bugs:

- **Full game via the engine** — drive a complete game with an auto-player
  (`legalMoves` + `reduce`) to confirm explore → omens → haunt → winner.
- **Live multiplayer** — boot the server
  (`PORT=8799 pnpm --filter @dread-hollow/server start`) and connect two `ws`
  clients to verify create/join-by-code, server-authoritative rules, identity
  stamping, automatic bot turns, and cross-client sync.
- **Artifact** — `pnpm build:artifact`, then assert every `DH.*` symbol the
  artifact calls exists in the bundled engine.

Update this skill whenever you hit a new blocker or find a better check.
