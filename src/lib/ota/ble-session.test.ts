import { afterEach, describe, expect, it, vi } from "vitest";
import type { BleCharacteristic, BleClient, BleDevice, BleNotification } from "../ble/types";
import { OtaBleSession } from "./ble-session";
import { buildFlashCommand } from "./protocol";
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

  it("falls back to write when writeWithoutResponse is unavailable for preferred writes", async () => {
    const client = new NotificationBleClient();
    client.writeWithoutResponse.mockRejectedValue(new Error("unsupported write type"));
    const session = new OtaBleSession(client, "device-1");

    await session.write(notifyTarget.serviceUuid, notifyTarget.charUuid, [1, 2, 3], true);

    expect(client.writeWithoutResponse).toHaveBeenCalledWith(
      "device-1",
      notifyTarget.serviceUuid,
      notifyTarget.charUuid,
      [1, 2, 3],
      20,
    );
    expect(client.write).toHaveBeenCalledWith("device-1", notifyTarget.serviceUuid, notifyTarget.charUuid, [1, 2, 3], 20);
  });

  it("times out when a preferred BLE write hangs", async () => {
    vi.useFakeTimers();
    const client = new NotificationBleClient();
    client.writeWithoutResponse.mockImplementation(() => new Promise(() => {}));
    client.write.mockImplementation(() => new Promise(() => {}));
    const session = new OtaBleSession(client, "device-1");

    const promise = session.write(notifyTarget.serviceUuid, notifyTarget.charUuid, [1, 2, 3], true);
    const expectation = expect(promise).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(10_000);

    await expectation;
  });

  it("traces OTA packet writes without exposing raw password text", async () => {
    const client = new NotificationBleClient();
    const trace: string[] = [];
    const session = new OtaBleSession(client, "device-1", undefined, (message) => trace.push(message));

    await session.write(notifyTarget.serviceUuid, notifyTarget.charUuid, buildFlashCommand("6666666666666666", 0x08007800, [1, 2, 3]), true);
    await session.write(notifyTarget.serviceUuid, notifyTarget.charUuid, Array.from("secret", (char) => char.charCodeAt(0)));

    expect(trace.some((message) => message.includes("AT+TX FLASH"))).toBe(true);
    expect(trace.some((message) => message.includes("payload redigido"))).toBe(true);
    expect(trace.join("\n")).not.toContain("secret");
  });

  it("prioritizes the requested write characteristic when multiple write targets exist", async () => {
    const client = new NotificationBleClient();
    client.characteristics = [
      {
        serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
        characteristicUuid: "0000ffe2-0000-1000-8000-00805f9b34fb",
        properties: { notify: true, indicate: false, write: true, writeWithoutResponse: true },
      },
      {
        serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
        characteristicUuid: "0000ffe1-0000-1000-8000-00805f9b34fb",
        properties: { notify: false, indicate: false, write: true, writeWithoutResponse: true },
      },
    ];
    const session = new OtaBleSession(client, "device-1");

    const discovery = await session.discoverUuids(
      "0000ffe0-0000-1000-8000-00805f9b34fb",
      "0000ffe2-0000-1000-8000-00805f9b34fb",
      "0000ffe1-0000-1000-8000-00805f9b34fb",
    );

    expect(discovery.uuids.writeCharUuid).toBe("0000ffe1-0000-1000-8000-00805f9b34fb");
  });
});
