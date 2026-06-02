import { Bluetooth, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { getBleDeviceIdentity } from "../lib/ble/device-identity";
import type { BleDevice } from "../lib/ble/types";
import type { KhompDeviceType } from "../lib/constants";
import { getKhompDeviceType, getKhompDeviceTypeLabel } from "../lib/constants";
import type { ScanStatus } from "../hooks/use-ble-devices";
import { useBleDevicesStore } from "../stores/ble-devices-store";

type DeviceSidebarProps = {
  devices: BleDevice[];
  selectedDeviceKey: string | null;
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

function formatShortId(value: string): string {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function getSignalBars(rssi: number): number {
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -78) return 2;
  return 1;
}

function SignalBars({ level }: { level: number }) {
  return (
    <span className="signal-bars" aria-hidden="true">
      {[1, 2, 3, 4].map((bar) => (
        <span key={bar} className={bar <= level ? "active" : ""} />
      ))}
    </span>
  );
}

export function DeviceSidebar({
  devices,
  selectedDeviceKey,
  scanStatus,
  scanRemainingSeconds,
  scanError,
  onRefresh,
  onStartScan,
  onSelectDevice,
}: DeviceSidebarProps) {
  const [query, setQuery] = useState("");
  const isDeviceOnline = useBleDevicesStore((state) => state.isDeviceOnline);
  const onlineDeviceCount = devices.filter((device) => isDeviceOnline(device.id)).length;
  const scanProgress = scanStatus === "scanning" ? Math.max(0, Math.min(100, (scanRemainingSeconds / 20) * 100)) : 0;

  const filteredDevices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return devices.filter((device) => {
      const type = getDeviceType(device);
      if (!type) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return `${getDeviceName(device)} ${device.localName ?? ""} ${device.id}`.toLowerCase().includes(normalizedQuery);
    });
  }, [devices, query]);

  return (
    <aside className="device-sidebar" aria-label="Dispositivos BLE">
      <div className="scan-box">
        <button
          type="button"
          className={scanStatus === "scanning" ? "scan-button active" : "scan-button"}
          onClick={scanStatus === "error" ? onRefresh : onStartScan}
          disabled={scanStatus === "scanning"}
          title="Executar scan BLE de 20 segundos"
        >
          <Bluetooth size={14} />
          <span>{scanStatus === "scanning" ? "Escaneando" : "Iniciar scan"}</span>
          <span className="scan-duration">{scanStatus === "scanning" ? `${String(scanRemainingSeconds).padStart(2, "0")}s` : "20s"}</span>
        </button>

        <div className="scan-progress" aria-hidden="true">
          <span style={{ width: `${scanProgress}%` }} />
        </div>

        {scanError ? <p className="inline-error">{scanError}</p> : null}

        <label className="search-field">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou IMEI"
            aria-label="Buscar dispositivo"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} title="Limpar busca">
              <X size={12} />
            </button>
          ) : null}
        </label>
      </div>

      <div className="device-section-heading">
        <h2>Dispositivos</h2>
        <span>
          {onlineDeviceCount}/{devices.length}
        </span>
      </div>

      <div className="device-list">
        {filteredDevices.length === 0 ? (
          <div className="device-empty-state">
            {scanStatus === "scanning" ? "Aguardando dispositivos..." : "Nenhum dispositivo encontrado."}
          </div>
        ) : null}
        {filteredDevices.map((device) => {
          const type = getDeviceType(device);
          const isOnline = isDeviceOnline(device.id);
          const deviceKey = getBleDeviceIdentity(device);

          return (
            <article
              key={device.id}
              className={`device-row ${selectedDeviceKey === deviceKey ? "selected" : ""}`}
            >
              <button type="button" className="device-main" onClick={() => onSelectDevice(device)}>
                <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                <strong>{getDeviceName(device)}</strong>
                <small>{type ? getKhompDeviceTypeLabel(type) : "Khomp"}</small>
                <span className="device-short-id">{formatShortId(device.id)}</span>
              </button>
              <div className="device-meta">
                {isOnline ? (
                  <span className="device-rssi">
                    <SignalBars level={getSignalBars(device.rssi)} />
                    {device.rssi} dBm
                  </span>
                ) : (
                  <span>offline · {formatLastSeen(device.lastSeenAt)}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
