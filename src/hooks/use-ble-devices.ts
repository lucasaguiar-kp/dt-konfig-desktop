import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tauriBleClient } from "../lib/ble/client";
import type { BleClient, BleDevice } from "../lib/ble/types";
import { getKhompDeviceType } from "../lib/constants";
import { useBleDevicesStore } from "../stores/ble-devices-store";

type UseBleDevicesOptions = {
  client?: BleClient;
  autoStart?: boolean;
};

export type ScanStatus = "idle" | "scanning" | "error";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Nao foi possivel executar a operacao BLE.";
}

function isCompatibleDevice(device: BleDevice): boolean {
  return Boolean(getKhompDeviceType(device.name ?? device.localName));
}

export function useBleDevices(options: UseBleDevicesOptions = {}) {
  const client = options.client ?? tauriBleClient;
  const autoStart = options.autoStart ?? true;
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const addOrUpdateDevice = useBleDevicesStore((state) => state.addOrUpdateDevice);
  const clearDevices = useBleDevicesStore((state) => state.clearDevices);
  const removeStaleDevices = useBleDevicesStore((state) => state.removeStaleDevices);
  const devicesVersion = useBleDevicesStore((state) => state.devices);
  const pinnedDeviceIds = useBleDevicesStore((state) => state.pinnedDeviceIds);
  const pinnedDeviceSnapshots = useBleDevicesStore((state) => state.pinnedDeviceSnapshots);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(false);
  const scanOperationRef = useRef(0);

  const devices = useMemo(() => {
    void devicesVersion;
    void pinnedDeviceIds;
    void pinnedDeviceSnapshots;
    return useBleDevicesStore.getState().getDevicesList().filter(isCompatibleDevice);
  }, [devicesVersion, pinnedDeviceIds, pinnedDeviceSnapshots]);

  const startScan = useCallback(async () => {
    if (startPromiseRef.current) {
      return startPromiseRef.current;
    }

    const operationId = ++scanOperationRef.current;
    const startPromise = client
      .startScan()
      .then(() => {
        if (!isMountedRef.current || scanOperationRef.current !== operationId) {
          return;
        }

        setScanStatus("scanning");
        setError(null);
      })
      .catch((scanError: unknown) => {
        if (!isMountedRef.current || scanOperationRef.current !== operationId) {
          return;
        }

        const message = getErrorMessage(scanError);
        setScanStatus("error");
        setError(message);
      })
      .finally(() => {
        if (startPromiseRef.current === startPromise) {
          startPromiseRef.current = null;
        }
      });

    startPromiseRef.current = startPromise;
    return startPromise;
  }, [client]);

  const stopScan = useCallback(async () => {
    const operationId = ++scanOperationRef.current;
    startPromiseRef.current = null;

    try {
      await client.stopScan();
      if (!isMountedRef.current || scanOperationRef.current !== operationId) {
        return;
      }

      setScanStatus("idle");
    } catch (stopError) {
      if (!isMountedRef.current || scanOperationRef.current !== operationId) {
        return;
      }

      setScanStatus("error");
      setError(getErrorMessage(stopError));
    }
  }, [client]);

  const refreshScan = useCallback(async () => {
    clearDevices();
    await stopScan();
    await startScan();
  }, [clearDevices, startScan, stopScan]);

  useEffect(() => {
    isMountedRef.current = true;
    let unsubscribe: (() => void) | null = null;

    client
      .onDeviceDiscovered((device) => {
        if (!isCompatibleDevice(device)) {
          return;
        }

        addOrUpdateDevice(device);
      })
      .then((unlisten) => {
        if (!isMountedRef.current) {
          unlisten();
          return;
        }

        unsubscribe = unlisten;
      })
      .catch((subscribeError: unknown) => {
        if (!isMountedRef.current) {
          return;
        }

        setScanStatus("error");
        setError(getErrorMessage(subscribeError));
      });

    if (autoStart) {
      void startScan();
    }

    const staleInterval = window.setInterval(removeStaleDevices, 5_000);

    return () => {
      isMountedRef.current = false;
      scanOperationRef.current += 1;
      startPromiseRef.current = null;
      window.clearInterval(staleInterval);
      unsubscribe?.();
      void client.stopScan().catch(() => undefined);
    };
  }, [addOrUpdateDevice, autoStart, client, removeStaleDevices, startScan]);

  return {
    devices,
    scanStatus,
    error,
    startScan,
    stopScan,
    refreshScan,
  };
}
