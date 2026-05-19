#!/bin/sh
set -eu

PORT="${VITE_PORT:-1420}"
PROJECT_DIR="$(pwd)"

for pid in $(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true); do
  args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  case "$args" in
    *"$PROJECT_DIR/node_modules/.bin/vite"*)
      kill "$pid" 2>/dev/null || true
      ;;
  esac
done

exec vite --host 127.0.0.1 --port "$PORT" --strictPort
