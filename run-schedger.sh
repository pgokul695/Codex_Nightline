#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"

if [[ ! -f server/.env ]]; then
  echo "Missing server/.env. Copy server/.env.example and set GEMINI_API_KEY." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

if [[ ! -d server/.venv ]]; then
  python3 -m venv server/.venv
fi

server/.venv/bin/pip install -r server/requirements.txt

server/.venv/bin/uvicorn main:app --app-dir server --host 0.0.0.0 --port 5014 &
backend_pid=$!

cleanup() {
  kill "$backend_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

VITE_EXTRACTION_API_URL="${VITE_EXTRACTION_API_URL:-https://schedgeb.gokulp.online}" npm run dev
