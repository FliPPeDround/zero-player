#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${SERVER_APP_DIR:-$(pwd)}"
cd "$APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed on the server" >&2
  exit 1
fi

DOCKER_CMD=(docker)
if ! docker info >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
  DOCKER_CMD=(sudo docker)
fi

if ! "${DOCKER_CMD[@]}" compose version >/dev/null 2>&1; then
  echo "docker compose plugin is not available" >&2
  exit 1
fi

if [[ -z "${BETTER_AUTH_SECRET:-}" ]]; then
  echo "BETTER_AUTH_SECRET is required" >&2
  exit 1
fi

printf 'BETTER_AUTH_URL=%s\nBETTER_AUTH_SECRET=%s\nAGENT_TOKEN_TTL_DAYS=%s\nDATABASE_URL=%s\n' \
  "${BETTER_AUTH_URL:-https://zeroplayer.space}" \
  "${BETTER_AUTH_SECRET}" \
  "${AGENT_TOKEN_TTL_DAYS:-30}" \
  "${DATABASE_URL:-file:.data/db/sqlite.db}" > .env

"${DOCKER_CMD[@]}" compose up -d --build
"${DOCKER_CMD[@]}" compose ps
