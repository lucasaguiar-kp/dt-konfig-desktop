import { useCallback, useMemo, useState } from "react";
import { DeviceSidebar } from "../components/device-sidebar";
import { DeviceTerminalPanel } from "../components/device-terminal-panel";
import { getBleDeviceIdentity } from "../lib/ble/device-identity";
import type { BleDevice } from "../lib/ble/types";
import { useBleDevices } from "../hooks/use-ble-devices";
import { useBleDevicesStore } from "../stores/ble-devices-store";

const RECONNECT_SCAN_WAIT_MS = 2_500;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function DevicesView() {
  const { devices, scanStatus, scanRemainingSeconds, error, startScan, refreshScan } = useBleDevices();
  const [selectedDeviceKey, setSelectedDeviceKey] = useState<string | null>(null);

  const selectedDevice = useMemo(
    () => devices.find((device) => getBleDeviceIdentity(device) === selectedDeviceKey) ?? null,
    [devices, selectedDeviceKey],
  );

  function selectDevice(device: BleDevice) {
    setSelectedDeviceKey(getBleDeviceIdentity(device));
  }

  const onlineDeviceCount = devices.filter((device) => useBleDevicesStore.getState().isDeviceOnline(device.id)).length;

  const resolveSelectedDeviceIdBeforeConnect = useCallback(async () => {
    if (!selectedDeviceKey) {
      return null;
    }

    const fallbackDeviceId = selectedDevice?.id ?? null;

    await refreshScan();

    const deadline = Date.now() + RECONNECT_SCAN_WAIT_MS;
    while (Date.now() < deadline) {
      const latestDevice = useBleDevicesStore
        .getState()
        .getDevicesList()
        .find((device) => getBleDeviceIdentity(device) === selectedDeviceKey);

      if (
        latestDevice?.id &&
        (latestDevice.id !== fallbackDeviceId || useBleDevicesStore.getState().isDeviceOnline(latestDevice.id))
      ) {
        return latestDevice.id;
      }

      await wait(100);
    }

    return (
      useBleDevicesStore
        .getState()
        .getDevicesList()
        .find((device) => getBleDeviceIdentity(device) === selectedDeviceKey)?.id ?? fallbackDeviceId
    );
  }, [refreshScan, selectedDevice?.id, selectedDeviceKey]);

  return (
    <div className="devices-workbench">
      <div className="devices-view">
        <DeviceSidebar
          devices={devices}
          selectedDeviceKey={selectedDeviceKey}
          scanStatus={scanStatus}
          scanRemainingSeconds={scanRemainingSeconds}
          scanError={error}
          onRefresh={() => void refreshScan()}
          onStartScan={() => void startScan()}
          onSelectDevice={selectDevice}
        />
        <DeviceTerminalPanel
          device={selectedDevice}
          autoConnect
          resolveDeviceIdBeforeConnect={resolveSelectedDeviceIdBeforeConnect}
        />
      </div>
      <footer className="status-bar">
        <span>{selectedDevice ? `Selecionado ${selectedDevice.name ?? selectedDevice.localName}` : "Nenhum dispositivo selecionado"}</span>
        <span>{scanStatus === "scanning" ? `Scan ativo por ${scanRemainingSeconds}s` : "Scan parado"}</span>
        <span>
          {onlineDeviceCount}/{devices.length} online
        </span>
      </footer>
    </div>
  );
}
