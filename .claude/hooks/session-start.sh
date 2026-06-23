#!/usr/bin/env bash
# SessionStart hook: make sure the workspace is installed so a fresh session
# (local, web, or cloud) can run tests / typecheck / build immediately.
set -e
cd "$(dirname "$0")/../.."

if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

if command -v pnpm >/dev/null 2>&1; then
  echo "[session-start] installing workspace dependencies…"
  pnpm install --prefer-offline >/dev/null 2>&1 || pnpm install || true
  echo "[session-start] ready: pnpm test · pnpm typecheck · pnpm build · pnpm dev"
else
  echo "[session-start] pnpm not found — run 'corepack enable' then 'pnpm install'."
fi
