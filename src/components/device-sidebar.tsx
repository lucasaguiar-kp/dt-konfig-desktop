import { ArrowDownAZ, ArrowUpAZ, Pin, RefreshCw, Search, SlidersHorizontal, Star } from "lucide-react";
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
  scanError: string | null;
  onRefresh: () => void;
  onStartScan: () => void;
  onStopScan: () => void;
  onSelectDevice: (device: BleDevice) => void;
};

type SortMode = "recent" | "name" | "rssi";

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
  scanError,
  onRefresh,
  onStartScan,
  onStopScan,
  onSelectDevice,
}: DeviceSidebarProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<KhompDeviceType | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const pinnedDeviceIds = useBleDevicesStore((state) => state.pinnedDeviceIds);
  const isDeviceOnline = useBleDevicesStore((state) => state.isDeviceOnline);
  const togglePinnedDevice = useBleDevicesStore((state) => state.togglePinnedDevice);

  const filteredDevices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const visibleDevices = devices.filter((device) => {
        const type = getDeviceType(device);
        if (!type) {
          return false;
        }

        if (typeFilter !== "all" && type !== typeFilter) {
          return false;
        }

        if (pinnedOnly && !pinnedDeviceIds.includes(device.id)) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return `${getDeviceName(device)} ${device.id}`.toLowerCase().includes(normalizedQuery);
      });

    return [...visibleDevices].sort((first, second) => {
      if (sortMode === "name") {
        return getDeviceName(first).localeCompare(getDeviceName(second));
      }

      if (sortMode === "rssi") {
        return second.rssi - first.rssi;
      }

      return second.lastSeenAt - first.lastSeenAt;
    });
  }, [devices, pinnedDeviceIds, pinnedOnly, query, sortMode, typeFilter]);

  return (
    <aside className="device-sidebar" aria-label="Dispositivos BLE">
      <div className="sidebar-header">
        <div>
          <p className="eyebrow">BLE scan</p>
          <h2>Dispositivos</h2>
        </div>
        <div className={`scan-pill scan-pill-${scanStatus}`}>{scanStatus}</div>
      </div>

      <div className="scan-actions" aria-label="Controles de scan">
        <button type="button" className="icon-button primary" onClick={onRefresh} title="Atualizar scan">
          <RefreshCw size={18} />
        </button>
        <button type="button" className="control-button" onClick={onStartScan}>
          Iniciar
        </button>
        <button type="button" className="control-button" onClick={onStopScan}>
          Parar
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

      <div className="filter-grid">
        <label>
          <span>Tipo</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as KhompDeviceType | "all")}
          >
            <option value="all">Todos</option>
            <option value="DTN_NB">DTN NB</option>
            <option value="DTL_LORA">DTL LoRa</option>
          </select>
        </label>
        <label>
          <span>Ordenar</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="recent">Recentes</option>
            <option value="name">Nome</option>
            <option value="rssi">Sinal</option>
          </select>
        </label>
      </div>

      <div className="toggle-row">
        <SlidersHorizontal size={16} />
        <span>Somente fixados</span>
        <button
          type="button"
          className={`toggle-switch ${pinnedOnly ? "active" : ""}`}
          onClick={() => setPinnedOnly((value) => !value)}
          aria-pressed={pinnedOnly}
        >
          <span />
        </button>
      </div>

      <div className="sort-hint">
        {sortMode === "name" ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}
        <span>{filteredDevices.length} compativeis</span>
      </div>

      <div className="device-list">
        {filteredDevices.map((device) => {
          const type = getDeviceType(device);
          const isPinned = pinnedDeviceIds.includes(device.id);
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
              <button
                type="button"
                className={`pin-button ${isPinned ? "active" : ""}`}
                onClick={() => togglePinnedDevice(device.id)}
                title={isPinned ? "Desafixar dispositivo" : "Fixar dispositivo"}
              >
                {isPinned ? <Star size={16} fill="currentColor" /> : <Pin size={16} />}
              </button>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
