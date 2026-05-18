# DT Konfig Desktop Tauri Port Design

## Context

The existing React Native app in `/Users/lucasaguiar/www/kp/dt-konfig` is an Expo app for field configuration of Khomp devices over BLE. It supports BLE scanning, favorite devices, a terminal-style configuration session, custom command shortcuts, and DTN NB OTA firmware updates from a `.bin` file.

The new desktop app will live in `/Users/lucasaguiar/www/kp/dt-konfig-desktop`. It must be built with Tauri and started with `bun create tauri-app`. The desktop app must support macOS, Windows, and Linux in the first version.

## Goals

- Translate the React Native app into a desktop web UI while preserving the core operational flows.
- Keep BLE communication functional on desktop computers across macOS, Windows, and Linux.
- Include the complete OTA flow in the first desktop version.
- Keep OTA driven only by IMEI, because the device is not expected to be powered or discoverable before the OTA procedure begins.
- Reuse proven TypeScript business logic where practical, especially terminal parsing, device type detection, user commands, and OTA protocol logic.

## Non-Goals

- Do not keep React Native Web as the desktop UI runtime.
- Do not redesign the product into a mobile-sized app inside a desktop window.
- Do not start OTA from a selected scanned device in the first version.
- Do not rewrite the full OTA protocol in Rust unless the Tauri BLE bridge forces a specific operation to move backend-side.

## Recommended Approach

Use React, TypeScript, Vite, and Tailwind for the frontend, with Tauri v2 as the desktop shell and Rust backend. The frontend should call a narrow TypeScript BLE adapter that wraps Tauri IPC commands and events. The backend should implement desktop BLE through a Rust BLE library, with `btleplug` as the likely base because it targets Windows, macOS, and Linux through native BLE stacks.

This approach avoids carrying React Native mobile abstractions into the desktop app while still preserving the tested protocol and parser logic from the original app.

## Architecture

### Frontend

The frontend should be a React web app with a desktop shell:

- `src/app` or `src/routes`: screen-level views and navigation state.
- `src/components`: reusable UI components translated from the mobile app into desktop controls.
- `src/lib/ble`: Tauri BLE adapter and frontend BLE types.
- `src/lib/device-terminal`: ported terminal protocol, parser, commands, and characteristic resolution helpers.
- `src/lib/ota`: ported OTA protocol, validation, steps, and flow orchestration.
- `src/stores`: Zustand stores for discovered devices, pinned devices, and user commands.
- `src/storage`: desktop persistence wrapper.

The frontend should not import Tauri IPC directly from feature components. Feature code should call typed application services such as `bleClient.startScan()` or `otaService.startDtnNbOta()`.

### Backend

The Tauri backend should expose BLE operations as commands and events:

- `ble_start_scan`
- `ble_stop_scan`
- `ble_connect`
- `ble_disconnect`
- `ble_services`
- `ble_start_notify`
- `ble_stop_notify`
- `ble_write`
- `ble_write_without_response`
- `ble_adapter_state`

If the platform supports MTU negotiation through the selected BLE library, expose it as `ble_request_mtu`. If not, the frontend OTA flow must fall back to conservative write sizes.

The backend should emit events for:

- discovered device
- scan state changes
- adapter state changes
- characteristic notification payloads
- disconnects
- backend BLE errors

The event payloads should be serializable, stable, and independent of `btleplug` internal types.

## Desktop UI Design

Use a master-detail layout instead of mobile-style stacked screens.

The left sidebar contains:

- scan status and refresh controls
- search by name or ID
- device type filter
- sorting controls
- pinned-only toggle
- compatible discovered devices
- pinned device snapshots when a device is offline

The main area contains:

- empty state when no device is selected
- device terminal/configuration when a device is selected
- connection status, reconnect action, and copy-terminal action
- RX/TX terminal history
- pinned command toolbar
- command input and send action
- command management panel or route for create, edit, delete, and pin

The OTA flow is a separate workspace view or tab accessible globally. It contains:

- IMEI field
- OTA password field
- `.bin` firmware file picker
- instructions copied and adapted from the mobile flow
- progress bar and current step text
- success and error states

OTA must search for a BLE device whose advertised name matches the IMEI during the update procedure. It must not depend on a selected device from the scanner list.

## BLE Behavior

Device filtering remains compatible with the mobile app:

- `DTN NB`: advertised names starting with `86`
- `DTL LoRa`: advertised names starting with `a84`

Scanning should allow repeated updates so RSSI stays current. The frontend device store should preserve pinned device snapshots and remove stale online devices on a cleanup interval.

Terminal connection should:

- stop scanning before connecting when required by the platform
- connect to the selected device
- discover services and characteristics
- resolve terminal service `ffe0`
- prefer a characteristic that supports write plus notify when available
- enable notifications
- parse incoming ASCII chunks with the existing terminal parser
- write commands with the existing AT command byte builder

## OTA Behavior

The OTA flow should preserve the mobile behavior:

- validate the selected `.bin` firmware
- start or restart BLE scanning
- search up to 90 seconds for a device whose name equals the provided IMEI
- connect to the discovered device
- discover service, notify characteristic, and write characteristic candidates
- enable notifications
- run sync handshake using the OTA password
- query bootloader version
- erase flash
- write firmware blocks
- reboot the device
- report progress and errors to the UI

The first implementation should keep the OTA protocol and step orchestration in TypeScript when possible. The Rust backend should provide the BLE transport primitives. If write timing, notification buffering, or platform constraints make this unreliable, move only the transport-sensitive parts behind a Rust command while keeping the UI contract stable.

## Persistence

Use a small storage abstraction so the app can switch implementation without changing stores.

Preferred desktop storage is Tauri plugin store. If project setup or package stability makes that expensive during the first pass, `localStorage` is acceptable behind the same storage interface, provided it is not referenced directly by stores or components.

Persist:

- pinned device IDs and snapshots
- user commands per device
- pinned command IDs per device

Do not persist transient BLE connection state or OTA progress.

## Platform Notes

macOS and Windows should use their native BLE stacks through the Rust BLE backend.

Linux support depends on BlueZ and local permissions. The app documentation should include the required system packages and any service or group setup needed for BLE scanning and connections.

## Error Handling

Show user-facing errors for:

- Bluetooth adapter unavailable or powered off
- scan failure
- permission or platform access failure
- device connection timeout
- missing terminal service or characteristic
- notification subscription failure
- write failure
- OTA device not found by IMEI
- invalid firmware file
- OTA handshake, erase, flash, or reboot failure

Errors should include enough context for field support but avoid exposing raw debug dumps as the primary message. Detailed logs can remain in developer console or a future log export.

## Testing And Verification

Automated checks:

- TypeScript typecheck.
- Rust build/check.
- Unit tests for device type detection, terminal parser, terminal byte builder, OTA protocol helpers, and storage behavior.
- Mocked tests for the frontend BLE adapter receiving Tauri events and invoking commands.

Manual verification:

- Scan compatible devices on macOS, Windows, and Linux.
- Connect to DTN NB and DTL LoRa devices where available.
- Send AT commands and receive parsed responses.
- Create, edit, delete, and pin user commands.
- Run a complete DTN NB OTA from `.bin` by IMEI on at least one supported desktop platform before calling OTA production-ready.

## Acceptance Criteria

- The desktop project is created with `bun create tauri-app`.
- The app builds and runs as a Tauri desktop app.
- The UI uses a desktop master-detail layout.
- BLE scanner discovers and filters compatible Khomp devices.
- Users can connect to a device and use the terminal to send commands and read responses.
- User commands and pinned devices persist between app restarts.
- OTA firmware update is available in the first version and starts from IMEI, password, and `.bin` file only.
- The BLE backend is designed for macOS, Windows, and Linux, with Linux BlueZ requirements documented.
