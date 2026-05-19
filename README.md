# DT Konfig Desktop

DT Konfig Desktop is a native desktop version of DT Konfig for configuring BLE devices and running DTN NB OTA updates by IMEI.

<img width="1800" height="1169" alt="DT Konfig Desktop terminal screen" src="https://github.com/user-attachments/assets/a23fa481-b660-4d2b-8b83-0b6e65433435" />

## What It Does

- Scans compatible DT devices over Bluetooth Low Energy.
- Keeps discovered devices visible even when they temporarily disconnect.
- Connects to a selected device and opens a BLE terminal for password and AT command flows.
- Supports saved commands, pinned commands, and commands that require values.
- Runs DTN NB OTA updates by IMEI, without requiring the device to be selected in advance.
- Ships as a Tauri desktop app with a React frontend and a Rust BLE backend.

## Platform Support

The application is designed for desktop use with native Bluetooth access:

- macOS Apple Silicon
- Windows x64
- Linux x64

For macOS distribution, send the generated `.dmg` file to the user.

## Development

Install dependencies:

```bash
bun install
```

Run the desktop app in development mode:

```bash
bun run tauri dev
```

On macOS, the project also includes a helper that opens the debug `.app` bundle so Bluetooth permissions behave like a real desktop application:

```bash
bun run dev:macos
```

Run only the frontend dev server:

```bash
bun run dev
```

## Build

Build the frontend:

```bash
bun run build
```

Generate release bundles:

```bash
bun run tauri build
```

macOS artifacts are generated under:

```bash
src-tauri/target/release/bundle/
```

The main file to send to macOS users is:

```bash
src-tauri/target/release/bundle/dmg/DT Konfig_0.1.0_aarch64.dmg
```

## GitHub Actions Releases

This repository includes a release workflow at `.github/workflows/release.yml`.

To generate draft releases with macOS, Windows, and Linux bundles:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow creates a draft GitHub Release and attaches the generated installers.

## Linux BLE Requirements

Linux builds require BlueZ and Bluetooth permissions on the target machine. Package names vary by distro, but Ubuntu/Debian users generally need:

```bash
sudo apt install bluez
sudo systemctl enable --now bluetooth
```

The user running the app must have permission to access the local Bluetooth adapter.

## Verification

Run the project checks before creating a release build:

```bash
bun run test
bun run typecheck
bun run build
cargo check --manifest-path src-tauri/Cargo.toml
bun run tauri build --debug
```

## Project Structure

- `src`: React desktop UI and TypeScript application services.
- `src-tauri`: Tauri shell and Rust BLE backend.
- `scripts`: local development helpers for Vite and macOS `.app` mode.
- `.github/workflows`: GitHub Actions release automation.
- `docs/superpowers`: implementation notes, plans, and specs.
