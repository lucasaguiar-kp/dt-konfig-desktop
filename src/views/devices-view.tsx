import { useMemo, useState } from "react";
import { DeviceSidebar } from "../components/device-sidebar";
import { DeviceTerminalPanel } from "../components/device-terminal-panel";
import type { BleDevice } from "../lib/ble/types";
import { useBleDevices } from "../hooks/use-ble-devices";

export function DevicesView() {
  const { devices, scanStatus, scanRemainingSeconds, error, startScan, refreshScan } = useBleDevices();
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
        scanRemainingSeconds={scanRemainingSeconds}
        scanError={error}
        onRefresh={() => void refreshScan()}
        onStartScan={() => void startScan()}
        onSelectDevice={selectDevice}
      />
      <DeviceTerminalPanel device={selectedDevice} autoConnect />
    </div>
  );
}
