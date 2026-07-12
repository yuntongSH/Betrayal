# Publishing Dread Hollow on CrazyGames

The code side is done — the client ships with the CrazyGames SDK v3 wired in
(`apps/client/src/net/crazygames.ts`), active **only** in the portal build.
GitHub Pages, itch.io, VIVERSE and local dev are untouched: off-portal the
bridge is a no-op, and an ad blocker or failed SDK load never breaks the game.

## What's integrated

| Portal requirement | Where it lives |
| --- | --- |
| `loadingStart` / `loadingStop` | `main.tsx` boot → first `App` render |
| `gameplayStart` / `gameplayStop` | phase transitions in `state/store.ts` (`syncPortal`) — explore/haunt count as play, reconnects included |
| `happytime()` | survivors win |
| Midgame ad | once per match, on the results screen (world at rest, score muted for the spot, player's mute preference restored) |
| Invite links | "Copy invite link" in the Foyer → `SDK.game.inviteLink({roomCode})` on-portal, `?join=CODE` URL elsewhere; the Lobby prefills the code from either |
| Size limits | `scripts/build-crazygames.mjs` fails the build past 250 MB / 1500 files |

Local QA: `pnpm dev`, then open `http://localhost:5173/?cg=1` — the SDK runs
in its `local` mode with demo ads.

## Launch checklist (manual steps — accounts are yours)

1. **Host the multiplayer server** (~free at this scale; scale-to-zero is on):
   ```bash
   brew install flyctl
   fly auth signup            # or: fly auth login
   fly launch --copy-config --no-deploy   # accept or rename the app
   fly deploy
   curl https://<app-name>.fly.dev/health  # → ok
   ```
2. **Build the submission zip** (point it at your app):
   ```bash
   CG_SERVER_URL=wss://<app-name>.fly.dev pnpm build:crazygames
   ```
   → `dread-hollow-crazygames.zip` at the repo root.
3. **Submit**: create a developer account at
   [developer.crazygames.com](https://developer.crazygames.com), Submit game →
   HTML5 → upload the zip. Fill the store page (title, description, tags:
   multiplayer / horror / board / 3D; screenshots — `scripts/shot-charselect.mjs`
   and `scripts/audit-fp-shots.mjs` produce good ones).
4. **Basic Launch** (~2 weeks, limited audience, no SDK requirements): they
   measure playtime, conversion and retention. Watch the portal dashboard.
5. **Full Launch review**: the SDK events above are already integrated, which
   is their main gate. Their QA also checks: lands in gameplay fast (our
   one-click "Play solo vs 3 bots" is the answer — consider making it the
   visually primary button for the portal build), PEGI-12 content (we're
   stylized dread, no gore — fine), and AdBlock resilience (handled).
6. **Payouts**: monthly from €100, PayPal or wire — set up in the portal.

## Notes

- **Poki is off the table while we're here**: their default deal is 5-year
  web exclusivity, which would forbid CrazyGames, VIVERSE and even our own
  GitHub Pages hosting.
- The server URL is baked at build time (`VITE_SERVER_URL`); the deployed
  GitHub Pages build can also get multiplayer by rebuilding with the same
  variable once the Fly app exists.
- If the game takes off on the portal, the same Fly app serves every other
  storefront build — one server, many fronts.
