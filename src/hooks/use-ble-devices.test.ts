import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BleCharacteristic, BleClient, BleDevice, BleNotification } from "../lib/ble/types";
import { useBleDevices } from "./use-ble-devices";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

class TestBleClient implements BleClient {
  startScanDeferred = createDeferred<void>();
  startScanCalls = 0;
  stopScanCalls = 0;

  async startScan(): Promise<void> {
    this.startScanCalls += 1;
    return this.startScanDeferred.promise;
  }

  async stopScan(): Promise<void> {
    this.stopScanCalls += 1;
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async services(): Promise<BleCharacteristic[]> {
    return [];
  }
  async startNotify(): Promise<void> {}
  async stopNotify(): Promise<void> {}
  async write(): Promise<void> {}
  async writeWithoutResponse(): Promise<void> {}
  async onDeviceDiscovered(_callback: (device: BleDevice) => void): Promise<() => void> {
    return () => undefined;
  }
  async onNotification(_callback: (notification: BleNotification) => void): Promise<() => void> {
    return () => undefined;
  }
}

describe("useBleDevices", () => {
  it("waits for an explicit startScan by default", async () => {
    const client = new TestBleClient();

    renderHook(() => useBleDevices({ client }));

    await waitFor(() => expect(client.startScanCalls).toBe(0));
  });

  it("does not set scanning after stopScan invalidates an in-flight startScan", async () => {
    const client = new TestBleClient();
    const { result } = renderHook(() => useBleDevices({ client, autoStart: false }));
    let startPromise: Promise<void>;

    act(() => {
      startPromise = result.current.startScan();
    });

    await waitFor(() => expect(client.startScanCalls).toBe(1));

    await act(async () => {
      await result.current.stopScan();
    });

    expect(result.current.scanStatus).toBe("idle");

    client.startScanDeferred.resolve();
    await act(async () => {
      await startPromise;
    });

    expect(result.current.scanStatus).toBe("idle");
    expect(client.stopScanCalls).toBe(1);
  });
});
