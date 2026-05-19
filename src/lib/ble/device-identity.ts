import { getKhompDeviceType } from "../constants";
import type { BleDevice } from "./types";

type DeviceIdentityInput = Pick<BleDevice, "id" | "name" | "localName">;

function normalizeIdentity(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function getBleDeviceIdentity(device: DeviceIdentityInput): string {
  const stableName = normalizeIdentity(device.name) ?? normalizeIdentity(device.localName);

  if (getKhompDeviceType(stableName)) {
    return `khomp:${stableName}`;
  }

  return device.id;
}
