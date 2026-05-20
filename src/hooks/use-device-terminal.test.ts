import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BleCharacteristic, BleClient, BleDevice, BleNotification } from "../lib/ble/types";
import { useDeviceTerminal } from "./use-device-terminal";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

class TerminalTestClient implements BleClient {
  servicesDeferred = createDeferred<BleCharacteristic[]>();
  servicesByDevice = new Map<string, BleCharacteristic[] | Promise<BleCharacteristic[]>>();
  disconnectDeferredByDevice = new Map<string, ReturnType<typeof createDeferred<void>>>();
  startNotifyDeferredByDevice = new Map<string, ReturnType<typeof createDeferred<void>>>();
  startNotifyErrorByDevice = new Map<string, Error>();
  connectDeferredByDevice = new Map<string, ReturnType<typeof createDeferred<void>>>();
  connectCalls: string[] = [];
  disconnectCalls: string[] = [];
  startNotifyCalls: Array<[string, string, string]> = [];
  stopNotifyCalls: Array<[string, string, string]> = [];
  onNotificationUnlistenCalls = 0;
  private notificationCallbacks = new Set<(notification: BleNotification) => void>();

  async startScan(): Promise<void> {}
  async stopScan(): Promise<void> {}

  async connect(deviceId: string): Promise<void> {
    this.connectCalls.push(deviceId);
    const deferred = this.connectDeferredByDevice.get(deviceId);
    if (deferred) {
      this.connectDeferredByDevice.delete(deviceId);
      await deferred.promise;
    }
  }

  async disconnect(deviceId: string): Promise<void> {
    this.disconnectCalls.push(deviceId);
    const deferred = this.disconnectDeferredByDevice.get(deviceId);
    if (deferred) {
      await deferred.promise;
    }
  }

  async services(deviceId: string): Promise<BleCharacteristic[]> {
    return this.servicesByDevice.get(deviceId) ?? this.servicesDeferred.promise;
  }

  async startNotify(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<void> {
    this.startNotifyCalls.push([deviceId, serviceUuid, characteristicUuid]);
    const deferred = this.startNotifyDeferredByDevice.get(deviceId);
    const error = this.startNotifyErrorByDevice.get(deviceId);
    if (deferred) {
      this.startNotifyDeferredByDevice.delete(deviceId);
      this.startNotifyErrorByDevice.delete(deviceId);
      await deferred.promise;
      if (error) {
        throw error;
      }
    }

    if (error) {
      this.startNotifyErrorByDevice.delete(deviceId);
      throw error;
    }
  }

  async stopNotify(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<void> {
    this.stopNotifyCalls.push([deviceId, serviceUuid, characteristicUuid]);
  }

  async write(): Promise<void> {}
  async writeWithoutResponse(): Promise<void> {}
  async onDeviceDiscovered(_callback: (device: BleDevice) => void): Promise<() => void> {
    return () => undefined;
  }

  async onNotification(_callback: (notification: BleNotification) => void): Promise<() => void> {
    this.notificationCallbacks.add(_callback);
    return () => {
      this.notificationCallbacks.delete(_callback);
      this.onNotificationUnlistenCalls += 1;
    };
  }

  emitNotification(notification: BleNotification): void {
    for (const callback of this.notificationCallbacks) {
      callback(notification);
    }
  }
}

function textToBytes(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

const TERMINAL_CHARACTERISTICS: BleCharacteristic[] = [
  {
    serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
    characteristicUuid: "0000ffe1-0000-1000-8000-00805f9b34fb",
    properties: {
      notify: true,
      indicate: false,
      write: true,
      writeWithoutResponse: true,
    },
  },
];

describe("useDeviceTerminal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not subscribe or update connection state after an in-flight connect is unmounted", async () => {
    const client = new TerminalTestClient();
    const { result, unmount } = renderHook(() =>
      useDeviceTerminal({
        client,
        deviceId: "device-a",
        deviceType: "DTN_NB",
      }),
    );
    let connectPromise: Promise<void>;

    act(() => {
      connectPromise = result.current.connect();
    });

    await waitFor(() => expect(client.connectCalls).toEqual(["device-a"]));

    unmount();
    client.servicesDeferred.resolve(TERMINAL_CHARACTERISTICS);

    await act(async () => {
      await connectPromise;
    });

    expect(client.startNotifyCalls).toEqual([]);
    expect(client.onNotificationUnlistenCalls).toBe(0);
    expect(client.disconnectCalls).toContain("device-a");
  });

  it("keeps the new device connected when the previous device cleanup finishes later", async () => {
    const client = new TerminalTestClient();
    const deviceADisconnect = createDeferred<void>();
    client.servicesByDevice.set("device-a", TERMINAL_CHARACTERISTICS);
    client.servicesByDevice.set("device-b", TERMINAL_CHARACTERISTICS);

    const { result, rerender } = renderHook(
      ({ deviceId }: { deviceId: string }) =>
        useDeviceTerminal({
          client,
          deviceId,
          deviceType: "DTN_NB",
        }),
      { initialProps: { deviceId: "device-a" } },
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("connected");
    client.disconnectDeferredByDevice.set("device-a", deviceADisconnect);

    rerender({ deviceId: "device-b" });
    await waitFor(() => expect(client.disconnectCalls).toContain("device-a"));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("connected");
    expect(client.startNotifyCalls).toContainEqual(["device-b", "ffe0", "ffe1"]);

    await act(async () => {
      deviceADisconnect.resolve();
      await deviceADisconnect.promise;
    });

    expect(result.current.status).toBe("connected");
  });

  it("does not let stale connect failure cleanup overwrite a newer connected session", async () => {
    const client = new TerminalTestClient();
    const deviceADisconnect = createDeferred<void>();
    const deviceAStartNotify = createDeferred<void>();
    client.servicesByDevice.set("device-a", TERMINAL_CHARACTERISTICS);
    client.servicesByDevice.set("device-b", TERMINAL_CHARACTERISTICS);
    client.startNotifyDeferredByDevice.set("device-a", deviceAStartNotify);
    client.startNotifyErrorByDevice.set("device-a", new Error("notify failed"));

    const { result, rerender } = renderHook(
      ({ deviceId }: { deviceId: string }) =>
        useDeviceTerminal({
          client,
          deviceId,
          deviceType: "DTN_NB",
        }),
      { initialProps: { deviceId: "device-a" } },
    );
    let failedConnectPromise: Promise<void>;

    act(() => {
      failedConnectPromise = result.current.connect();
    });

    await waitFor(() => expect(client.startNotifyCalls).toContainEqual(["device-a", "ffe0", "ffe1"]));
    client.disconnectDeferredByDevice.set("device-a", deviceADisconnect);

    await act(async () => {
      deviceAStartNotify.resolve();
      await deviceAStartNotify.promise;
    });

    await waitFor(() => expect(client.disconnectCalls.filter((deviceId) => deviceId === "device-a")).toHaveLength(2));

    rerender({ deviceId: "device-b" });
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("connected");

    await act(async () => {
      deviceADisconnect.resolve();
      await failedConnectPromise;
    });

    expect(result.current.status).toBe("connected");
  });

  it("does not let stale cleanup clear pending RX for the active session", async () => {
    const client = new TerminalTestClient();
    const deviceADisconnect = createDeferred<void>();
    client.servicesByDevice.set("device-a", TERMINAL_CHARACTERISTICS);
    client.servicesByDevice.set("device-b", TERMINAL_CHARACTERISTICS);

    const { result, rerender } = renderHook(
      ({ deviceId }: { deviceId: string }) =>
        useDeviceTerminal({
          client,
          deviceId,
          deviceType: "DTN_NB",
        }),
      { initialProps: { deviceId: "device-a" } },
    );

    await act(async () => {
      await result.current.connect();
    });

    client.disconnectDeferredByDevice.set("device-a", deviceADisconnect);
    rerender({ deviceId: "device-b" });
    await waitFor(() => expect(client.disconnectCalls).toContain("device-a"));

    await act(async () => {
      await result.current.connect();
    });

    vi.useFakeTimers();

    act(() => {
      client.emitNotification({
        deviceId: "device-b",
        serviceUuid: "ffe0",
        characteristicUuid: "ffe1",
        value: [72, 69, 76],
      });
    });

    await act(async () => {
      deviceADisconnect.resolve();
      await deviceADisconnect.promise;
      vi.advanceTimersByTime(400);
    });

    expect(result.current.history.some((entry) => entry.direction === "rx" && entry.text === "HEL")).toBe(true);
  });

  it("does not let stale same-device cleanup tear down a newer same-device session", async () => {
    const client = new TerminalTestClient();
    const staleStartNotify = createDeferred<void>();
    client.servicesByDevice.set("device-a", TERMINAL_CHARACTERISTICS);
    client.startNotifyDeferredByDevice.set("device-a", staleStartNotify);
    client.startNotifyErrorByDevice.set("device-a", new Error("notify failed"));

    const { result } = renderHook(() =>
      useDeviceTerminal({
        client,
        deviceId: "device-a",
        deviceType: "DTN_NB",
      }),
    );
    let staleConnectPromise: Promise<void>;

    act(() => {
      staleConnectPromise = result.current.connect();
    });

    await waitFor(() => expect(client.startNotifyCalls).toContainEqual(["device-a", "ffe0", "ffe1"]));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("connected");
    const stopNotifyCallsBeforeStaleCleanup = client.stopNotifyCalls.length;
    const disconnectCallsBeforeStaleCleanup = client.disconnectCalls.length;

    await act(async () => {
      staleStartNotify.resolve();
      await staleConnectPromise;
    });

    expect(result.current.status).toBe("connected");
    expect(client.stopNotifyCalls).toHaveLength(stopNotifyCallsBeforeStaleCleanup);
    expect(client.disconnectCalls).toHaveLength(disconnectCallsBeforeStaleCleanup);
  });

  it("does not let stale same-device cleanup tear down a newer in-flight same-device session", async () => {
    const client = new TerminalTestClient();
    const staleStartNotify = createDeferred<void>();
    const newConnect = createDeferred<void>();
    client.servicesByDevice.set("device-a", TERMINAL_CHARACTERISTICS);
    client.startNotifyDeferredByDevice.set("device-a", staleStartNotify);
    client.startNotifyErrorByDevice.set("device-a", new Error("notify failed"));

    const { result } = renderHook(() =>
      useDeviceTerminal({
        client,
        deviceId: "device-a",
        deviceType: "DTN_NB",
      }),
    );
    let staleConnectPromise: Promise<void>;
    let newConnectPromise: Promise<void>;

    act(() => {
      staleConnectPromise = result.current.connect();
    });

    await waitFor(() => expect(client.startNotifyCalls).toContainEqual(["device-a", "ffe0", "ffe1"]));
    client.connectDeferredByDevice.set("device-a", newConnect);

    act(() => {
      newConnectPromise = result.current.connect();
    });

    await waitFor(() => expect(client.connectCalls.filter((deviceId) => deviceId === "device-a")).toHaveLength(2));
    const stopNotifyCallsBeforeStaleCleanup = client.stopNotifyCalls.length;
    const disconnectCallsBeforeStaleCleanup = client.disconnectCalls.length;

    await act(async () => {
      staleStartNotify.resolve();
      await staleConnectPromise;
    });

    expect(client.stopNotifyCalls).toHaveLength(stopNotifyCallsBeforeStaleCleanup);
    expect(client.disconnectCalls).toHaveLength(disconnectCallsBeforeStaleCleanup);

    await act(async () => {
      newConnect.resolve();
      await newConnectPromise;
    });

    expect(result.current.status).toBe("connected");
  });

  it("keeps the terminal log and asks for the password again when the password expires", async () => {
    const client = new TerminalTestClient();
    client.servicesByDevice.set("device-a", TERMINAL_CHARACTERISTICS);
    const { result } = renderHook(() =>
      useDeviceTerminal({
        client,
        deviceId: "device-a",
        deviceType: "DTN_NB",
      }),
    );

    await act(async () => {
      await result.current.connect();
      await result.current.sendCommand("378d0c");
    });

    const disconnectCallsAfterConnect = client.disconnectCalls.length;
    vi.useFakeTimers();

    act(() => {
      client.emitNotification({
        deviceId: "device-a",
        serviceUuid: "ffe0",
        characteristicUuid: "ffe1",
        value: textToBytes("PASSWORD TIMEOUT"),
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    const logText = result.current.history.map((entry) => entry.text);
    expect(result.current.status).toBe("connected");
    expect(result.current.stage).toBe("password");
    expect(client.disconnectCalls).toHaveLength(disconnectCallsAfterConnect);
    expect(logText).toContain("Conectado ao terminal BLE.");
    expect(logText).toContain("378d0c");
    expect(logText).toContain("PASSWORD TIMEOUT");
    expect(logText).toContain("Tempo para senha expirado.");
  });

  it("keeps the terminal log across failed and successful reconnect attempts", async () => {
    const client = new TerminalTestClient();
    let resolvedDeviceId = "device-a";
    client.servicesByDevice.set("device-a", TERMINAL_CHARACTERISTICS);
    const { result } = renderHook(() =>
      useDeviceTerminal({
        client,
        deviceId: "device-a",
        deviceType: "DTN_NB",
        resolveDeviceIdBeforeConnect: async () => resolvedDeviceId,
      }),
    );

    await act(async () => {
      await result.current.connect();
      await result.current.sendCommand("AT+CFG");
    });

    resolvedDeviceId = "device-offline";
    client.servicesByDevice.set("device-offline", Promise.reject(new Error("BLE device not found: device-offline")));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.history.map((entry) => entry.text)).toEqual(
      expect.arrayContaining(["Conectado ao terminal BLE.", "AT+CFG", "BLE device not found: device-offline"]),
    );

    client.servicesByDevice.set("device-offline", TERMINAL_CHARACTERISTICS);

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.history.map((entry) => entry.text)).toEqual(
      expect.arrayContaining([
        "Conectado ao terminal BLE.",
        "AT+CFG",
        "BLE device not found: device-offline",
      ]),
    );
    expect(result.current.history.filter((entry) => entry.text === "Conectado ao terminal BLE.")).toHaveLength(2);
  });
});
