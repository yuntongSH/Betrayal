# Authoritative game server.
# Build from the repository root so the shared workspace is available:
#   docker build -f packages/server/Dockerfile -t dread-hollow-server .
FROM node:22-alpine

RUN corepack enable
WORKDIR /app

# Copy the whole workspace (node_modules/dist are excluded via .dockerignore).
COPY . .

RUN pnpm install --frozen-lockfile

ENV PORT=8787
EXPOSE 8787

CMD ["pnpm", "--filter", "@dread-hollow/server", "start"]
