#!/bin/sh
set -eu

APP_PATH="src-tauri/target/debug/bundle/macos/DT Konfig.app"
APP_BIN="$APP_PATH/Contents/MacOS/dt-konfig-desktop"
DEBUG_BIN="src-tauri/target/debug/dt-konfig-desktop"

if [ ! -d "$APP_PATH" ] \
  || [ src-tauri/tauri.conf.json -nt "$APP_PATH/Contents/Info.plist" ] \
  || [ src-tauri/Info.plist -nt "$APP_PATH/Contents/Info.plist" ]; then
  bun run tauri build --debug
fi

cargo build --manifest-path src-tauri/Cargo.toml --no-default-features
cp "$DEBUG_BIN" "$APP_BIN"
codesign --force --deep --sign - "$APP_PATH" >/dev/null 2>&1 || true

bun run dev &
VITE_PID=$!

cleanup() {
  kill "$VITE_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

open -n "$APP_PATH"
wait "$VITE_PID"
