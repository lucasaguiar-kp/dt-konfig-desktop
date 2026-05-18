import { useMemo, useState } from "react";
import { DeviceSidebar } from "../components/device-sidebar";
import { DeviceTerminalPanel } from "../components/device-terminal-panel";
import type { BleDevice } from "../lib/ble/types";
import { useBleDevices } from "../hooks/use-ble-devices";

export function DevicesView() {
  const { devices, scanStatus, error, startScan, stopScan, refreshScan } = useBleDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  function selectDevice(device: BleDevice) {
    setSelectedDeviceId(device.id);
  }

  return (
    <div className="devices-view">
      <DeviceSidebar
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        scanStatus={scanStatus}
        scanError={error}
        onRefresh={() => void refreshScan()}
        onStartScan={() => void startScan()}
        onStopScan={() => void stopScan()}
        onSelectDevice={selectDevice}
      />
      <DeviceTerminalPanel device={selectedDevice} stopScan={stopScan} autoConnect />
    </div>
  );
}
