import { RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { BleDevice } from "../lib/ble/types";
import type { KhompDeviceType } from "../lib/constants";
import { getKhompDeviceType, getKhompDeviceTypeLabel } from "../lib/constants";
import type { ScanStatus } from "../hooks/use-ble-devices";
import { useBleDevicesStore } from "../stores/ble-devices-store";

type DeviceSidebarProps = {
  devices: BleDevice[];
  selectedDeviceId: string | null;
  scanStatus: ScanStatus;
  scanRemainingSeconds: number;
  scanError: string | null;
  onRefresh: () => void;
  onStartScan: () => void;
  onSelectDevice: (device: BleDevice) => void;
};

function getDeviceName(device: BleDevice): string {
  return device.name ?? device.localName ?? "Dispositivo sem nome";
}

function getDeviceType(device: BleDevice): KhompDeviceType | null {
  return getKhompDeviceType(device.name ?? device.localName);
}

function formatLastSeen(value: number): string {
  if (!value) {
    return "snapshot";
  }

  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  return seconds < 3 ? "agora" : `${seconds}s`;
}

export function DeviceSidebar({
  devices,
  selectedDeviceId,
  scanStatus,
  scanRemainingSeconds,
  scanError,
  onRefresh,
  onStartScan,
  onSelectDevice,
}: DeviceSidebarProps) {
  const [query, setQuery] = useState("");
  const isDeviceOnline = useBleDevicesStore((state) => state.isDeviceOnline);

  const filteredDevices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const visibleDevices = devices.filter((device) => {
        const type = getDeviceType(device);
        if (!type) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return `${getDeviceName(device)} ${device.id}`.toLowerCase().includes(normalizedQuery);
      });

    return [...visibleDevices].sort((first, second) => second.lastSeenAt - first.lastSeenAt);
  }, [devices, query]);

  return (
    <aside className="device-sidebar" aria-label="Dispositivos BLE">
      <div className="sidebar-header">
        <div>
          <p className="eyebrow">BLE scan</p>
          <h2>Dispositivos</h2>
        </div>
        <div className={`scan-pill scan-pill-${scanStatus}`}>
          {scanStatus === "scanning" ? `${scanRemainingSeconds}s` : scanStatus}
        </div>
      </div>

      <div className="scan-actions" aria-label="Controles de scan">
        <button
          type="button"
          className="icon-button primary"
          onClick={onRefresh}
          title="Reiniciar scan de 20 segundos"
          disabled={scanStatus === "scanning"}
        >
          <RefreshCw size={18} />
        </button>
        <button type="button" className="control-button" onClick={onStartScan} disabled={scanStatus === "scanning"}>
          {scanStatus === "scanning" ? "Escaneando" : "Iniciar scan"}
        </button>
      </div>

      {scanError ? <p className="inline-error">{scanError}</p> : null}

      <label className="search-field">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome ou ID"
          aria-label="Buscar dispositivo"
        />
      </label>

      <div className="sort-hint">
        <span>{filteredDevices.length} compativeis</span>
      </div>

      <div className="device-list">
        {filteredDevices.map((device) => {
          const type = getDeviceType(device);
          const isOnline = isDeviceOnline(device.id);

          return (
            <article
              key={device.id}
              className={`device-row ${selectedDeviceId === device.id ? "selected" : ""}`}
            >
              <button type="button" className="device-main" onClick={() => onSelectDevice(device)}>
                <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                <span>
                  <strong>{getDeviceName(device)}</strong>
                  <small>{device.id}</small>
                </span>
              </button>
              <div className="device-meta">
                <span>{type ? getKhompDeviceTypeLabel(type) : "Khomp"}</span>
                <span>{isOnline ? `${device.rssi} dBm` : formatLastSeen(device.lastSeenAt)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
