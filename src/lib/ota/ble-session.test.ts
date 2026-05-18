import { afterEach, describe, expect, it, vi } from "vitest";
import type { BleCharacteristic, BleClient, BleDevice, BleNotification } from "../ble/types";
import { OtaBleSession } from "./ble-session";
import type { NotificationTarget } from "./types";

class NotificationBleClient implements BleClient {
  devices: BleDevice[] = [];
  characteristics: BleCharacteristic[] = [];
  startScan = vi.fn(async () => {});
  stopScan = vi.fn(async () => {});
  connect = vi.fn(async () => {});
  disconnect = vi.fn(async () => {});
  services = vi.fn(async () => this.characteristics);
  startNotify = vi.fn(async () => {});
  stopNotify = vi.fn(async () => {});
  write = vi.fn(async () => {});
  writeWithoutResponse = vi.fn(async () => {});
  onDeviceDiscovered = vi.fn(async () => () => {});
  onNotification = vi.fn(async (_callback: (notification: BleNotification) => void) => () => {});
}

const notifyTarget: NotificationTarget = {
  serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
  charUuid: "0000ffe1-0000-1000-8000-00805f9b34fb",
};

describe("OtaBleSession notifications", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws when no notification target can be enabled", async () => {
    const client = new NotificationBleClient();
    client.startNotify.mockRejectedValue(new Error("notify unavailable"));
    const session = new OtaBleSession(client, "device-1");

    await expect(session.enableNotifications([notifyTarget])).rejects.toThrow(/notifications/i);
  });

  it("stops enabled notification targets during disconnect", async () => {
    const client = new NotificationBleClient();
    const session = new OtaBleSession(client, "device-1");

    await session.enableNotifications([notifyTarget]);
    await session.disconnect();

    expect(client.stopNotify).toHaveBeenCalledWith("device-1", notifyTarget.serviceUuid, notifyTarget.charUuid);
    expect(client.disconnect).toHaveBeenCalledWith("device-1");
  });

  it("rejects waitFor promptly when cancelled", async () => {
    vi.useFakeTimers();
    const client = new NotificationBleClient();
    const session = new OtaBleSession(client, "device-1");
    const controller = new AbortController();

    const promise = session.waitFor(5000, () => "continue", controller.signal);
    const expectation = expect(promise).rejects.toThrow(/cancel/i);

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    await expectation;
  });
});
