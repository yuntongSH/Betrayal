# 🕯️ Dread Hollow

> An open-source, **3D online haunted-house exploration & betrayal** board game
> for the web.

**▶️ Play in your browser:** https://yuntongsh.github.io/Betrayal/ — the
standalone build runs entirely client-side (solo vs. bots, or pass-and-play on
one screen); no install or server needed.

Gather a handful of friends, step into a manor that builds itself room by room as
you explore, and pray the omens stay quiet — because at some point the house
turns on you, and one of your own becomes something else entirely.

Dread Hollow is a faithful, **all-original** digital take on the modern
"explore-a-haunted-house-until-someone-betrays-you" tabletop genre. It reproduces
the *mechanics* of that genre — tile-by-tile exploration across three floors,
four-trait characters, Event / Item / Omen decks, the escalating **haunt roll**,
and the mid-game flip into **traitor vs. heroes** — with entirely original rooms,
cards, characters and scenarios, so it can live happily as free software.

> ⚖️ **About the source material.** This is an independent, fan-made tribute. It
> is not affiliated with, endorsed by, or built from the assets of any commercial
> board game. Game *mechanics* aren't copyrightable; every name, line of flavor
> text, character and scenario here is original to this repository.

## ✨ Features

- 🎲 **Faithful rules engine** — a pure, deterministic, fully-tested TypeScript
  core. The server and tests run the exact same code.
- 🏚️ **A manor that assembles itself** — rooms are drawn from a shuffled deck and
  placed as you push through doorways, across Basement, Ground and Upper floors.
- 👻 **The Haunt** — omens escalate until the house turns, splitting the party
  into traitor(s) and heroes, each with secret objectives and **thirteen shipped
  scenarios**. *Which* haunt fires is keyed to the omen you drew and the room you
  were standing in, so your choices author the story.
- 🎚️ **Difficulty** — Relaxed / Standard / Nightmare scale the haunt's monsters
  (Standard is the tuned baseline).
- 🕯️ **Legacy campaign** *(artifact)* — a persistent saga of linked games:
  forge named **heirlooms** that grow, **bloodlines** where heirs replace the
  fallen, and a **scarring house** that remembers where each haunt began.
- 🗝️ **Real per-turn agency** — beyond moving, each turn you can **Search**,
  **Investigate**, **Steady yourself** (rest), or **Barricade** a door. Movement
  is budgeted by *net distance* from where your turn began, so backtracking is
  free.
- 🚪 **Doors** — real doors at every passage, swinging open as figures cross.
- 🌐 **Online multiplayer** — an authoritative WebSocket server keeps every
  browser in sync and decides the rules; no client can cheat.
- 🩸 **3D & atmospheric** — three.js / react-three-fiber with **fog-of-war
  darkness** (the house is lit only by the candle-pools that follow the living),
  **reactive procedural audio** (door creaks, a heartbeat near death, a swell when
  the house turns), volumetric fog, drifting dust, bloom and a crushed palette.

## 🚀 Quick start

Requires Node 20+ and [pnpm](https://pnpm.io).

```bash
pnpm install

# terminal 1 — authoritative game server (ws://localhost:8787)
pnpm dev:server

# terminal 2 — web client (http://localhost:5173)
pnpm dev:client
```

Open the client, type a name and **Open a new manor**. Share the 4-letter room
code (or just open a second tab) so others can **Enter**. Each player picks a
character; the host begins the descent. Best with 3–6 explorers.

> Point the client at a different server with `VITE_SERVER_URL`, e.g.
> `VITE_SERVER_URL=wss://your-host pnpm dev:client`.

Prefer containers? `docker compose up --build` brings up both services — see
[`docs/DEPLOY.md`](docs/DEPLOY.md).

### 🎴 Single-file build (no install, no server)

Just want to try it? [`artifact/dread-hollow.html`](artifact/dread-hollow.html) is a
**standalone, single-file** build — open it in any browser (it loads three.js from
a CDN) and play **pass-and-play** on one screen. It runs the exact same rules
engine, bundled in. Regenerate it with:

```bash
pnpm build:artifact   # → artifact/dread-hollow.html
```

## 👥 Ways to play

- **Solo vs bots** — "Play solo vs 3 bots" drops you into a 4-player game (you +
  three AI explorers) the server (or the artifact) plays automatically.
- **Multiplayer** — open a manor, share the **4-letter room code**; anyone who
  enters it joins the *same* house. Bots take their turns on their own.
- **Auto-fill** — small parties are topped up to a minimum of three with bots on
  start, so two humans get one bot, a lone human gets two.
- **Add bots** — the host can add bots in the lobby for a fuller party.

## 🎮 How to play

The short version:

1. **Explore.** On your turn, move up to your **Speed**. Click a glowing room to
   walk there; click a flame arrow to push through a doorway and reveal a new
   tile. Discovered rooms trigger their special effects and card draws.
2. **Draw cards.** Events resolve at once; Items are kept for their bonuses;
   **Omens** are kept too — but every omen forces a **haunt roll**.
3. **The house turns.** When a haunt roll fails, the betrayal begins: one player
   becomes the traitor, monsters may appear, and each side gets a goal.
4. **Fight.** Strike monsters in your room (click them) or rival players (HUD
   buttons). The traitor's monsters hunt the heroes each round.
5. **Win.** The instant a side completes its objective, the game ends.

Full rules: [`docs/RULES.md`](docs/RULES.md).

## 🧱 Architecture

A pnpm monorepo:

| Package | What it is |
| --- | --- |
| [`packages/shared`](packages/shared) | Pure, deterministic rules engine + all content. No DOM, no I/O, fully tested. |
| [`packages/server`](packages/server) | Authoritative WebSocket server. Owns the canonical game state. |
| [`apps/client`](apps/client) | 3D web client (React + react-three-fiber + zustand). |

The server runs the *same* engine the tests run, and the client even reuses the
engine's `legalMoves()` to light up valid moves — so the rules are a single
source of truth that can never drift between layers.

```
packages/shared/src
├── rng.ts          deterministic, serializable PRNG
├── dice.ts         the {0,0,1,1,2,2} die, trait rolls, haunt roll
├── grid.ts         per-floor geometry & door rotation
├── house.ts        room connections, open doors, monster pathfinding
├── decks.ts        deck building / draw / reshuffle
├── state.ts        trait math, death-on-skull, the log
├── setup.ts        lobby → game start, start-tile placement
├── haunt.ts        the betrayal, combat, win checks
├── engine.ts       the authoritative reducer (the heart)
└── content/        characters, rooms, cards, haunts (all original)
```

## 🧪 Development

```bash
pnpm test        # run the rules-engine test suite (vitest)
pnpm typecheck   # type-check every package
pnpm build       # production build of the client
```

CI runs all three on every push and pull request.

## 🗺️ Roadmap

- A **front-end design pass** (the official `frontend-design` plugin runs locally).
- Bring the **legacy campaign to multiplayer** (server-persisted heirlooms /
  bloodlines / scars).
- Per-room 3D art instead of procedural slabs.
- Spectator mode and reconnect-by-name polish.
- Even more haunt scenarios (the framework supports any number).

> 📋 **Continuing development?** See [`HANDOFF.md`](HANDOFF.md) — a detailed status
> doc covering everything that's been built, how to verify it, and what's left to
> do, with file pointers.

Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 📜 License

[MIT](LICENSE) — do whatever you like, just keep the notice.
