import { describe, expect, it, vi } from "vitest";
import type { BleCharacteristic, BleClient, BleNotification } from "../ble/types";
import { resolveDeviceTerminalCharacteristic, subscribeToDeviceTerminal } from "./session";

class TestBleClient implements BleClient {
  characteristics: BleCharacteristic[] = [
    {
      serviceUuid: "ffe0",
      characteristicUuid: "ffe1",
      properties: { notify: true, indicate: false, write: true, writeWithoutResponse: false },
    },
  ];
  notificationCallbacks = new Set<(notification: BleNotification) => void>();
  startNotifyError: Error | null = null;
  startedNotifications: Array<[string, string, string]> = [];
  stoppedNotifications: Array<[string, string, string]> = [];

  async startScan(): Promise<void> {}
  async stopScan(): Promise<void> {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async services(): Promise<BleCharacteristic[]> {
    return this.characteristics;
  }
  async startNotify(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<void> {
    this.startedNotifications.push([deviceId, serviceUuid, characteristicUuid]);
    if (this.startNotifyError) {
      throw this.startNotifyError;
    }
  }
  async stopNotify(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<void> {
    this.stoppedNotifications.push([deviceId, serviceUuid, characteristicUuid]);
  }
  async write(): Promise<void> {}
  async writeWithoutResponse(): Promise<void> {}
  async onDeviceDiscovered(): Promise<() => void> {
    return () => {};
  }
  async onNotification(callback: (notification: BleNotification) => void): Promise<() => void> {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }
  emitNotification(notification: BleNotification): void {
    for (const callback of this.notificationCallbacks) callback(notification);
  }

  get listenerCount(): number {
    return this.notificationCallbacks.size;
  }
}

describe("resolveDeviceTerminalCharacteristic", () => {
  it("finds ffe0 service and selects separate notify and write characteristics", () => {
    const characteristic = resolveDeviceTerminalCharacteristic([
      {
        serviceUuid: "180a",
        characteristicUuid: "2a29",
        properties: { notify: true, indicate: false, write: false, writeWithoutResponse: false },
      },
      {
        serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
        characteristicUuid: "0000ffe1-0000-1000-8000-00805f9b34fb",
        properties: { notify: true, indicate: false, write: false, writeWithoutResponse: false },
      },
      {
        serviceUuid: "ffe0",
        characteristicUuid: "ffe2",
        properties: { notify: false, indicate: false, write: true, writeWithoutResponse: false },
      },
    ]);

    expect(characteristic).toEqual({
      serviceUuid: "ffe0",
      notifyCharUuid: "ffe1",
      writeCharUuid: "ffe2",
    });
  });
});

describe("subscribeToDeviceTerminal", () => {
  it("ignores notifications from other devices and passes printable ASCII for the target device", async () => {
    const bleClient = new TestBleClient();
    const onMessage = vi.fn();

    const subscription = await subscribeToDeviceTerminal(bleClient, "target-device", onMessage);

    bleClient.emitNotification({
      deviceId: "other-device",
      serviceUuid: "ffe0",
      characteristicUuid: "ffe1",
      value: [79, 84, 72, 69, 82],
    });
    bleClient.emitNotification({
      deviceId: "target-device",
      serviceUuid: "ffe0",
      characteristicUuid: "ffe1",
      value: [79, 75, 13, 10, 0, 255],
    });

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith("OK\r\n..");

    subscription.remove();
    expect(bleClient.stoppedNotifications).toEqual([["target-device", "ffe0", "ffe1"]]);
  });

  it("cleans up the notification listener when startNotify rejects", async () => {
    const bleClient = new TestBleClient();
    bleClient.startNotifyError = new Error("notify failed");

    await expect(subscribeToDeviceTerminal(bleClient, "target-device", vi.fn())).rejects.toThrow("notify failed");

    expect(bleClient.listenerCount).toBe(0);
  });
});
