<img width="1800" height="1169" alt="Screenshot 2026-05-18 at 20 13 54" src="https://github.com/user-attachments/assets/a23fa481-b660-4d2b-8b83-0b6e65433435" />
# DT Konfig Desktop

Desktop Tauri version of DT Konfig for BLE device configuration and DTN NB OTA updates.

## Development

Run:

```bash
bun install
bun run tauri dev
```

## Linux BLE Requirements

Install and enable BlueZ. The exact package names vary by distro:

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
- `docs/superpowers`: implementation plan, specs, and task notes.
