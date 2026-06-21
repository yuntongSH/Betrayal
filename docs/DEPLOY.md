# Deploying Dread Hollow

Dread Hollow is two services: the **server** (a long-lived Node WebSocket
process) and the **client** (static files built by Vite). They can live
anywhere; the only requirement is that the client knows the server's URL.

## One command, locally (Docker)

```bash
docker compose up --build
# open http://localhost:5173
```

This builds the server image and a static client served by nginx. The client is
built with `VITE_SERVER_URL=ws://localhost:8787`; change it in
`docker-compose.yml` for other hosts.

## Manual / split hosting

The two pieces deploy independently — common for free tiers.

### Server (any Node host)

```bash
pnpm install --frozen-lockfile
pnpm --filter @dread-hollow/server start   # honours $PORT, defaults to 8787
```

Point it at a host that supports WebSockets and keeps the process alive. Behind a
proxy, make sure WebSocket upgrades are forwarded; serve it over TLS (`wss://`)
in production. A `GET /health` endpoint returns `ok` for health checks.

### Client (any static host)

```bash
VITE_SERVER_URL=wss://your-server.example pnpm --filter @dread-hollow/client build
# deploy apps/client/dist/ to Netlify, Vercel, GitHub Pages, S3, …
```

`VITE_SERVER_URL` is inlined at build time, so rebuild if the server URL changes.
Use `wss://` whenever the page is served over HTTPS (browsers block mixed
`ws://` content).

## Scaling notes

Game state is held in memory per room, so a single server instance is the simple
path. To run multiple instances you'd add sticky routing by room code (or move
room state into a shared store) — out of scope for the current build.
