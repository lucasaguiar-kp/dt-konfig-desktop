#!/bin/sh
set -eu

if [ "$(uname -s)" = "Darwin" ] && [ "${1:-}" = "dev" ]; then
  shift
  exec sh scripts/dev-macos.sh "$@"
fi

exec tauri "$@"
