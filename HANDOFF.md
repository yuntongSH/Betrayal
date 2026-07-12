# 🕯️ Dread Hollow — Development Handoff

This document is a **working handoff** so you can pick the project up in local
VS Code and keep going. It records the state of the codebase, **what was built**
in the recent work sessions, **how to verify it**, and **what's left to do** —
with concrete file pointers.

- **Live build:** https://yuntongsh.github.io/Betrayal/
- **Active branch:** `claude/wizardly-darwin-l5087u` (all recent work is here)
- **Snapshot:** 13 haunts · 6 characters · 27 rooms · 15 items / 12 events / 8 omens · **121 passing tests**
- **What changed recently:** see [CHANGELOG.md](CHANGELOG.md) — the 2026-07
  sessions added the React 19 / R3F 9 migration, pmndrs character locomotion +
  haunt cinematic + VRM avatars, a full first-person mode (V), player-thrown
  dice, onboarding, and a room-detail quality pass, each with a headless
  verify script under `scripts/verify-*.mjs`.

---

## 1. Getting it locally

```bash
git fetch origin
git checkout claude/wizardly-darwin-l5087u
pnpm install
```

Day-to-day commands (Node 20+, pnpm):

```bash
pnpm test            # rules-engine test suite (vitest) — 121 tests
pnpm typecheck       # type-check every package
pnpm build           # production build of the React client
pnpm build:artifact  # regenerate the single-file artifact/dread-hollow.html
pnpm dev:server      # authoritative WebSocket server (ws://localhost:8787)
pnpm dev:client      # web client (http://localhost:5173)
```

The fastest way to playtest is the **standalone artifact**: open
`artifact/dread-hollow.html` in a browser (Play solo vs 3 bots). It bundles the
exact same engine, so it's the quickest loop for frontend/engine changes —
just `pnpm build:artifact` and refresh.

---

## 2. Architecture (where things live)

A pnpm monorepo. The **engine is the single source of truth**, shared by the
server, the React client, and the artifact.

| Path | What it is |
| --- | --- |
| `packages/shared/src` | Pure, deterministic rules engine + all content. No DOM/IO. Fully tested. |
| `packages/server/src` | Authoritative WebSocket server + the wire `protocol.ts` (zod). |
| `apps/client/src` | 3D web client (React + react-three-fiber + zustand). |
| `artifact/src` | The single-file build: `game.js` (vanilla three view + hotseat/bot loop) + `template.html`. Bundled by `scripts/build-artifact.mjs`. |
| `packages/decor` | Procedural 3D room decor / materials, shared by client + artifact. |

Key engine files: `engine.ts` (the reducer — the heart), `haunt.ts` (betrayal,
combat, monster phase, haunt selection), `house.ts` (connections, pathfinding,
net-distance), `state.ts` (trait math, auras), `setup.ts` (lobby → start, campaign
apply), `content/` (characters, rooms, cards, haunts — all original).

**Two frontends, one engine.** When you change a rule, it's in `packages/shared`
and *both* the client and the artifact inherit it. UI lives twice (React in
`apps/client`, vanilla in `artifact/src/game.js`) — keep them in parity.

---

## 3. What was built (recent sessions)

Newest first. Each item lists the main files and how to see it working.

### Legacy campaign mode (artifact) — `226b0f9`
A persistent, browser-saved saga of linked games ("🕯️ Begin a Legacy" on the
lobby).
- **Heirlooms** — after a chapter you name a surviving item; it's in hand from
  the start of every future chapter and steadies its bearer's trait, growing
  when reforged.
- **Bloodlines** — when an explorer dies, their family passes to a hardier heir
  (generation +1, a permanent starting-trait bump, clamped off the skull).
- **Scarring house** — the room where each haunt began becomes cursed ground
  (−1 die) for the rest of the saga.
- **Saga screen** — chapter, family/generation, heirlooms, scars, chronicle.
- Engine surface is tiny + server-safe: optional `GameState.campaign` applied in
  `setup.ts` (`applyCampaign`) and a scar penalty in `state.ts` (`roomAura`).
  Orchestration (localStorage, screens, end-of-chapter forge) is in
  `artifact/src/game.js` (search `LEGACY CAMPAIGN`). Types in `types.ts`
  (`CampaignModifiers`, `Heirloom`, `Bloodline`). Tests: `__tests__/campaign.test.ts`.
- ⚠️ **Artifact only** (single-player/hotseat). Multiplayer needs server-side
  persistence — see §5.

### Difficulty selector + How-to-Play onboarding — `0cca2bd`
- **Relaxed / Standard / Nightmare** scales the haunt's monster Might & HP.
  Standard is the tuned baseline (×1); verified monotonic: **81% → 62% → 38%**
  hero wins. Host-only, lobby-only. `types.ts` (`Difficulty`,
  `DIFFICULTY_FACTOR`), `set-difficulty` action + `protocol.ts`, applied in
  `haunt.ts` `triggerHaunt`. Lobby UI in both frontends.
- **How-to-Play** overlay in the artifact (lobby + in-game `?`). The React
  client already has an equivalent `HelpButton`.

### More haunts: 7 → 13 + omen×room selection — `c73c0d7`
- Six new, mechanically-distinct scenarios in `content/haunts.ts`: *What the
  Candles Summon* (rooted ritual focus), *The Long Cold* (re-forming swarm,
  survive), *The Hollow King* (kill the boss), *The Drowned Choir* (mental swarm
  / flee to chapel), *The Iron Bargain* (key-escape), *The Sleepless* (mind boss).
- Which haunt fires is keyed to **(omen drawn × room you were in)** — already in
  `haunt.ts` `selectHauntId`.
- Two engine generalizations: Speed-0 monster = stationary (a ritual focus); the
  ritual timer in `onTraitorTurnEnd` is data-driven (any haunt seeding
  `ritualNeeded`). Balanced via a per-haunt soak; 13 per-haunt termination tests.

### Fog-of-war darkness + reactive audio — `0ac63b0`
- The house is lit only by **candle pools that follow living explorers**
  (multi-source BFS → `litFactor`); distant rooms fall into shadow. Artifact:
  `buildHouse`/`visibilityLevels`. Client: `HouseView`→`RoomTile` + dimmed
  `Scene.tsx`.
- **Reactive procedural audio** (Web Audio, zero assets): drone/wind bed + door
  creak, low-Sanity heartbeat, haunt-reveal swell. Artifact: `Sound` module +
  `🔊` toggle. Client: `audio/ambient.ts` (+ `doorCreak/setHeart/stinger`) wired
  into `Doors`, `GameScreen`, `HauntBanner`.

### Net-distance movement — `bd2e881`
Walking back and forth no longer burns Speed — only **net progress from the
turn's start** costs movement; you can always step back even at 0 budget.
`house.ts` `netWalkDistance` (0/1 BFS), `engine.ts` `recomputeMovement`/`canReach`,
`GameState.turnStartKey/turnSpent/turnExplored`. Engine-only → both frontends
inherit it.

### Real doors with an opening animation — `64cbc9f`
Doors are built at every real passage (matching doorways between two placed
rooms); the leaf swings open when a figure crosses, then eases shut. Artifact:
`buildDoorEntry`/`syncDoors`/`openDoorBetween`. Client: new `three/Doors.tsx`.

### Four deliberate per-turn actions — `caab3c7`, bots use them — `7d26ddf`
**Search · Steady yourself (rest) · Barricade · Investigate** — each spends a
step. Engine handlers + `legalMoves` flags in `engine.ts`; `actions.ts` +
`protocol.ts`; HUD in both frontends. Bots use them sensibly (`bot.ts`).

### Earlier in the project
Cinematic atmosphere pass (vignette/grain/dread pulse), readable bot pacing +
on-screen action announcements, room-info + item-description cards, two rounds of
multi-agent bug-hunting & balance fixes (combat damage cap, tie consistency,
snapshot pruning, monster tuning), and the lobby/scroll fixes.

---

## 4. How it's verified

- **Unit/regression:** `pnpm test` (vitest, 121 tests in `packages/shared/src/__tests__`).
- **Balance & termination soaks:** ad-hoc Node scripts that bundle the engine to
  ESM and run hundreds/thousands of all-bot games, checking every game ends and
  measuring per-haunt and per-difficulty win rates. (Re-create under
  `scripts/` if you want them committed — they were run from a scratch dir.)
- **Headless browser:** Playwright + the preinstalled Chromium drives the
  artifact (software WebGL). Note: the artifact loads three.js from a CDN, so in
  a locked-down env you must route `cdn.jsdelivr.net/.../three@0.169.0/*` to
  `node_modules/.pnpm/three@0.169.0/node_modules/three`. Locally with normal
  network this isn't needed.

**Balance philosophy (intentional):** we do **not** chase 50/50 per-haunt
balance. Bot-vs-bot win rates ≠ human play, and the genre embraces a wide spread.
New haunts are tuned to sit *inside the existing band* (~45–96% hero in the soak
harness), not forced to parity.

---

## 5. What's left to do

### A. The `frontend-design` plugin (your immediate next step)
You installed the official **`frontend-design`** plugin in desktop Claude Code.
It could **not** be installed in the cloud session because that environment's
network policy blocks GitHub (the egress proxy 403'd the clone of
`anthropics/claude-code`, where the plugin lives) — only the project repo and
package registries are reachable there.

**Locally this just works.** In VS Code / desktop Claude Code:
- It's likely already installed. If not:
  ```
  /plugin          # Discover tab → frontend-design (claude-plugins-official)
  # or, from a terminal:
  claude plugin marketplace add anthropics/claude-code
  claude plugin install frontend-design@claude-plugins-official
  ```
- Once installed, Claude auto-applies it to frontend work — just ask to improve a
  screen and it brings the design skill to bear.
- (Optional, for future *web* sessions: widen the environment's network policy to
  allow `github.com`, then a SessionStart hook could auto-install it. See
  https://code.claude.com/docs/en/claude-code-on-the-web.)

**Suggested first design targets** (highest visibility first):
1. **Lobby / first impression** — title, tagline, character wardrobe, difficulty
   + Begin/Legacy buttons (`artifact/src/template.html` lobby, `apps/client` Lobby/RoomScreen).
2. **In-game HUD** — panels, type scale, contrast, the chronicle/trait/room/
   inventory cards, the bottom action bar.
3. **Set-piece overlays** — haunt reveal, results, How-to-Play, legacy screens.
4. **A cohesive design system** — one palette / type scale / spacing / button +
   panel components applied across both frontends.

### B. Multiplayer / server-persisted campaign
The legacy campaign is artifact-only (localStorage). To bring it to multiplayer:
persist `CampaignModifiers` server-side per room/account, add a campaign-aware
lobby + end-of-chapter flow in `apps/client`, and carry the saga across sessions.
Engine support already exists (`GameState.campaign` is applied at `startGame`).

### C. Smaller follow-ups
- **Bots claim heirlooms** — currently only the human's family forges heirlooms;
  bot families advance bloodlines but don't forge.
- **Mirror the watchable bot pacing** (step delays + on-screen announcements) from
  the artifact into the React client.
- **How-to-Play parity** — the artifact has the new overlay; confirm the client's
  `HelpButton` covers the new actions/doors/fog (it predates them).
- **Daily-seed challenge / run stats** — a lightweight meta-progression loop
  (shared seed, win streaks) on top of the campaign.

### D. Original roadmap (still open)
- Per-room 3D art instead of procedural slabs.
- Spectator mode, reconnect-by-name polish.
- Even more haunt scenarios (the framework supports any number).

---

## 6. Gotchas / conventions

- **Branch:** keep working on `claude/wizardly-darwin-l5087u` (or branch off it);
  open a PR into the default branch when ready.
- **Two frontends:** changes to UX usually need doing twice (React + artifact).
  Engine changes are inherited by both.
- **Rebuild the artifact** (`pnpm build:artifact`) after any change to
  `artifact/src/*` or `packages/shared/*` — the committed `dread-hollow.html` is
  the bundled output.
- **CI** runs `pnpm test`, `pnpm typecheck`, `pnpm build` on every push/PR.
- **All content is original** (names, flavor, scenarios) — keep it that way so the
  project stays freely licensable (MIT).

---

*Generated as a handoff for continuing development locally. See `README.md` for
the player-facing overview and `docs/` for deploy/rules notes.*
