# 3D web client — built once, then served as static files by nginx.
# Build from the repository root:
#   docker build -f apps/client/Dockerfile \
#     --build-arg VITE_SERVER_URL=wss://your-server -t dread-hollow-client .
FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# Bake the server URL in at build time (Vite inlines VITE_* envs).
ARG VITE_SERVER_URL=ws://localhost:8787
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN pnpm --filter @dread-hollow/client build

FROM nginx:alpine
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
