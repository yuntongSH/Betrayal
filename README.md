# 🕯️ Dread Hollow

> An open-source, **3D online haunted-house exploration & betrayal** board game for the web.

Gather a handful of friends, step into a manor that builds itself room by room as you
explore, and pray the omens stay quiet. Because at some point the house turns on you —
and one of your own becomes something else entirely.

Dread Hollow is a faithful, **all-original** digital implementation of the modern
"explore-a-haunted-house-until-someone-betrays-you" tabletop genre. It reproduces the
**mechanics** of that genre — tile-by-tile exploration across three floors, four-trait
characters, Event / Item / Omen decks, the escalating *haunt roll*, and the dramatic
mid-game flip into **traitor vs. heroes** — with entirely original rooms, cards,
characters and scenarios so it can live happily as free software.

> ⚖️ **On the source material.** This project is an independent, fan-made tribute. It is
> not affiliated with, endorsed by, or derived from the assets of any commercial board
> game. Game *mechanics* are not copyrightable; all text, names, characters and art here
> are original to this repository. See [`docs/RULES.md`](docs/RULES.md) once published.

## ✨ Features

- 🎲 **Faithful rules engine** — a pure, deterministic, fully-tested TypeScript core.
- 🏚️ **Procedural manor** — the house assembles itself from a shuffled room deck across
  Basement, Ground and Upper floors.
- 👻 **The Haunt** — escalating omens eventually trigger a scenario that splits the party
  into traitor(s) and heroes, each with their own secret objectives.
- 🌐 **Online multiplayer** — an authoritative WebSocket server keeps every browser in
  sync; no client can cheat the rules.
- 🩸 **3D & atmospheric** — rendered with three.js / react-three-fiber: volumetric fog,
  flickering candlelight, drifting dust, and a bloom-soaked, desaturated palette.

## 🧱 Architecture

This is a pnpm monorepo:

| Package | Description |
| --- | --- |
| [`packages/shared`](packages/shared) | Pure game-rules engine + content. No DOM, no I/O. |
| [`packages/server`](packages/server) | Authoritative WebSocket server. Owns game state. |
| [`apps/client`](apps/client) | 3D web client (React + react-three-fiber). |

The server runs the *exact same engine* the tests run, so the rules are identical
everywhere and the network layer is just transport.

## 🚀 Quick start

```bash
pnpm install

# terminal 1 — game server (ws://localhost:8787)
pnpm dev:server

# terminal 2 — web client (http://localhost:5173)
pnpm dev:client
```

Open the client in two browser tabs, create a room in one, join with the code in the
other, and start exploring.

## 🧪 Development

```bash
pnpm test        # run the rules-engine test suite
pnpm typecheck   # type-check every package
pnpm build       # production build of the client
```

## 📜 License

[MIT](LICENSE) — do whatever you like, just keep the notice.
