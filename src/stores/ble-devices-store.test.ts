import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BleDevice } from "../lib/ble/types";
import { storage } from "../storage";
import { useBleDevicesStore } from "./ble-devices-store";

function createDevice(overrides: Partial<BleDevice> = {}): BleDevice {
  return {
    id: "1",
    name: "Device 1",
    localName: "DT 1",
    rssi: -55,
    lastSeenAt: Date.now(),
    ...overrides,
  };
}

describe("useBleDevicesStore", () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    useBleDevicesStore.setState({
      devices: new Map(),
      pinnedDeviceIds: [],
      pinnedDeviceSnapshots: {},
    });
  });

  it("starts empty and can add, update, and pin a device", () => {
    const store = useBleDevicesStore.getState();

    expect(store.getDevicesList()).toEqual([]);

    store.addOrUpdateDevice(createDevice());
    store.addOrUpdateDevice(createDevice({ rssi: -50 }));

    expect(useBleDevicesStore.getState().getDevicesList()[0]?.id).toBe("1");
    expect(useBleDevicesStore.getState().isDeviceOnline("1")).toBe(true);

    useBleDevicesStore.getState().togglePinnedDevice("1");

    expect(useBleDevicesStore.getState().isPinned("1")).toBe(true);
    expect(useBleDevicesStore.getState().pinnedDeviceIds).toEqual(["1"]);
  });

  it("shows a pinned offline snapshot when the live device is unavailable", () => {
    useBleDevicesStore.getState().addOrUpdateDevice(createDevice({ name: "Pinned" }));
    useBleDevicesStore.getState().togglePinnedDevice("1");
    useBleDevicesStore.setState({ devices: new Map() });

    expect(useBleDevicesStore.getState().isDeviceOnline("1")).toBe(false);
    expect(useBleDevicesStore.getState().getDevicesList()).toEqual([
      {
        id: "1",
        name: "Pinned",
        localName: "DT 1",
        rssi: -55,
        lastSeenAt: expect.any(Number),
      },
    ]);
  });

  it("keeps stale unpinned devices visible as offline snapshots", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    useBleDevicesStore.getState().addOrUpdateDevice(createDevice({ id: "stale" }));
    useBleDevicesStore.getState().addOrUpdateDevice(createDevice({ id: "pinned" }));
    useBleDevicesStore.getState().togglePinnedDevice("pinned");

    vi.setSystemTime(32_000);
    useBleDevicesStore.getState().removeStaleDevices();

    expect(useBleDevicesStore.getState().getDevicesList().map((device) => device.id)).toEqual(["stale", "pinned"]);
    expect(useBleDevicesStore.getState().isDeviceOnline("stale")).toBe(false);
    expect(useBleDevicesStore.getState().isDeviceOnline("pinned")).toBe(false);
  });

  it("keeps discovered devices visible when starting a new scan", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    useBleDevicesStore.getState().addOrUpdateDevice(createDevice({ id: "unpinned" }));
    useBleDevicesStore.getState().addOrUpdateDevice(createDevice({ id: "pinned" }));
    useBleDevicesStore.getState().togglePinnedDevice("pinned");

    useBleDevicesStore.getState().clearDevices();

    expect(Array.from(useBleDevicesStore.getState().devices.keys())).toEqual(["unpinned", "pinned"]);
    expect(useBleDevicesStore.getState().getDevicesList().map((device) => device.id)).toEqual(["unpinned", "pinned"]);
    expect(useBleDevicesStore.getState().isDeviceOnline("unpinned")).toBe(true);
    expect(useBleDevicesStore.getState().isDeviceOnline("pinned")).toBe(true);
  });

  it("refreshes the BLE id when the same device is rediscovered", () => {
    useBleDevicesStore.getState().addOrUpdateDevice(
      createDevice({
        id: "old-ble-id",
        name: "861275072547918",
        localName: null,
      }),
    );

    useBleDevicesStore.getState().addOrUpdateDevice(
      createDevice({
        id: "new-ble-id",
        name: "861275072547918",
        localName: null,
        rssi: -44,
      }),
    );

    expect(useBleDevicesStore.getState().getDevicesList()).toEqual([
      expect.objectContaining({
        id: "new-ble-id",
        name: "861275072547918",
        rssi: -44,
      }),
    ]);
    expect(useBleDevicesStore.getState().isDeviceOnline("new-ble-id")).toBe(true);
    expect(useBleDevicesStore.getState().isDeviceOnline("old-ble-id")).toBe(false);
  });

  it("persists only pinned ids and pinned snapshots", async () => {
    useBleDevicesStore.getState().addOrUpdateDevice(createDevice({ id: "unpinned" }));
    useBleDevicesStore.getState().addOrUpdateDevice(createDevice({ id: "pinned", name: "Pinned" }));
    useBleDevicesStore.getState().togglePinnedDevice("pinned");

    const persistedValue = await storage.show<string>("ble-devices-store");
    const persisted = JSON.parse(persistedValue ?? "{}") as {
      state?: Record<string, unknown>;
    };

    expect(Object.keys(persisted.state ?? {}).sort()).toEqual(["pinnedDeviceIds", "pinnedDeviceSnapshots"]);
    expect(persisted.state?.pinnedDeviceIds).toEqual(["pinned"]);
    expect(persisted.state?.pinnedDeviceSnapshots).toEqual({
      pinned: expect.objectContaining({
        id: "pinned",
        name: "Pinned",
      }),
    });
  });
});
