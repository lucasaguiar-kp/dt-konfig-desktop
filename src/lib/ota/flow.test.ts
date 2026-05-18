import { afterEach, describe, expect, it, vi } from "vitest";
import type { BleClient, BleDevice } from "../ble/types";
import { findDeviceByImei, mapFlashProgressToOtaProgress } from "./flow";

class ScanOnlyBleClient implements Pick<BleClient, "startScan" | "stopScan" | "onDeviceDiscovered"> {
  startScan = vi.fn(async () => {});
  stopScan = vi.fn(async () => {});
  listeners = new Set<(device: BleDevice) => void>();
  unlisten = vi.fn();

  onDeviceDiscovered = vi.fn(async (callback: (device: BleDevice) => void): Promise<() => void> => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
      this.unlisten();
    };
  });

  emit(device: BleDevice): void {
    for (const listener of this.listeners) listener(device);
  }
}

describe("OTA flow helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps flash progress into the OTA 40-95 range", () => {
    expect(mapFlashProgressToOtaProgress(0)).toBe(40);
    expect(mapFlashProgressToOtaProgress(100)).toBe(95);
  });

  it("registers the discovery listener before starting scan", async () => {
    vi.useFakeTimers();
    const client = new ScanOnlyBleClient();

    const promise = findDeviceByImei({
      bleClient: client as unknown as BleClient,
      imei: "8675309",
      timeoutMs: 90_000,
    });
    const expectation = expect(promise).rejects.toThrow(/8675309/i);

    await vi.advanceTimersByTimeAsync(90_000);
    await expectation;

    expect(client.onDeviceDiscovered).toHaveBeenCalledBefore(client.startScan);
  });

  it("times out IMEI search after the requested scan window", async () => {
    vi.useFakeTimers();
    const client = new ScanOnlyBleClient();

    const promise = findDeviceByImei({
      bleClient: client as unknown as BleClient,
      imei: "8675309",
      timeoutMs: 90_000,
    });
    const expectation = expect(promise).rejects.toThrow(/8675309/i);

    await vi.advanceTimersByTimeAsync(90_000);

    await expectation;
    expect(client.startScan).toHaveBeenCalledTimes(1);
    expect(client.stopScan).toHaveBeenCalledTimes(1);
    expect(client.unlisten).toHaveBeenCalledTimes(1);
  });

  it("cleans up scan and listener when IMEI search is cancelled", async () => {
    vi.useFakeTimers();
    const client = new ScanOnlyBleClient();
    const controller = new AbortController();

    const promise = findDeviceByImei({
      bleClient: client as unknown as BleClient,
      imei: "8675309",
      timeoutMs: 90_000,
      signal: controller.signal,
    });
    const expectation = expect(promise).rejects.toThrow(/cancel/i);

    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(90_000);

    await expectation;
    expect(client.stopScan).toHaveBeenCalledTimes(1);
    expect(client.unlisten).toHaveBeenCalledTimes(1);
  });
});
