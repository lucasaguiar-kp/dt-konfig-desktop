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

const DESKTOP_SCAN_DURATION_MS = 20_000;

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
  const autoStart = options.autoStart ?? false;
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanRemainingSeconds, setScanRemainingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const addOrUpdateDevice = useBleDevicesStore((state) => state.addOrUpdateDevice);
  const clearDevices = useBleDevicesStore((state) => state.clearDevices);
  const removeStaleDevices = useBleDevicesStore((state) => state.removeStaleDevices);
  const devicesVersion = useBleDevicesStore((state) => state.devices);
  const pinnedDeviceIds = useBleDevicesStore((state) => state.pinnedDeviceIds);
  const pinnedDeviceSnapshots = useBleDevicesStore((state) => state.pinnedDeviceSnapshots);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const scanTimeoutRef = useRef<number | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const scanEndsAtRef = useRef(0);
  const isMountedRef = useRef(false);
  const scanOperationRef = useRef(0);

  const clearScanTimers = useCallback(() => {
    if (scanTimeoutRef.current !== null) {
      window.clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    if (scanIntervalRef.current !== null) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }, []);

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
    clearScanTimers();
    const startPromise = client
      .startScan()
      .then(() => {
        if (!isMountedRef.current || scanOperationRef.current !== operationId) {
          return;
        }

        scanEndsAtRef.current = Date.now() + DESKTOP_SCAN_DURATION_MS;
        setScanStatus("scanning");
        setScanRemainingSeconds(DESKTOP_SCAN_DURATION_MS / 1_000);
        setError(null);

        scanIntervalRef.current = window.setInterval(() => {
          if (!isMountedRef.current || scanOperationRef.current !== operationId) {
            return;
          }

          setScanRemainingSeconds(Math.max(0, Math.ceil((scanEndsAtRef.current - Date.now()) / 1_000)));
        }, 1_000);

        scanTimeoutRef.current = window.setTimeout(() => {
          clearScanTimers();
          void client
            .stopScan()
            .then(() => {
              if (!isMountedRef.current || scanOperationRef.current !== operationId) {
                return;
              }

              setScanStatus("idle");
              setScanRemainingSeconds(0);
            })
            .catch((stopError: unknown) => {
              if (!isMountedRef.current || scanOperationRef.current !== operationId) {
                return;
              }

              setScanStatus("error");
              setScanRemainingSeconds(0);
              setError(getErrorMessage(stopError));
            });
        }, DESKTOP_SCAN_DURATION_MS);
      })
      .catch((scanError: unknown) => {
        if (!isMountedRef.current || scanOperationRef.current !== operationId) {
          return;
        }

        const message = getErrorMessage(scanError);
        setScanStatus("error");
        setScanRemainingSeconds(0);
        setError(message);
      })
      .finally(() => {
        if (startPromiseRef.current === startPromise) {
          startPromiseRef.current = null;
        }
      });

    startPromiseRef.current = startPromise;
    return startPromise;
  }, [clearScanTimers, client]);

  const stopScan = useCallback(async () => {
    const operationId = ++scanOperationRef.current;
    startPromiseRef.current = null;
    clearScanTimers();

    try {
      await client.stopScan();
      if (!isMountedRef.current || scanOperationRef.current !== operationId) {
        return;
      }

      setScanStatus("idle");
      setScanRemainingSeconds(0);
    } catch (stopError) {
      if (!isMountedRef.current || scanOperationRef.current !== operationId) {
        return;
      }

      setScanStatus("error");
      setScanRemainingSeconds(0);
      setError(getErrorMessage(stopError));
    }
  }, [clearScanTimers, client]);

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
      clearScanTimers();
      window.clearInterval(staleInterval);
      unsubscribe?.();
      void client.stopScan().catch(() => undefined);
    };
  }, [addOrUpdateDevice, autoStart, clearScanTimers, client, removeStaleDevices, startScan]);

  return {
    devices,
    scanStatus,
    scanRemainingSeconds,
    error,
    startScan,
    stopScan,
    refreshScan,
  };
}
