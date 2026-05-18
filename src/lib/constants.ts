export type KhompDeviceType = "DTN_NB" | "DTL_LORA";

export function getKhompDeviceType(name?: string | null): KhompDeviceType | null {
  const normalized = name?.trim().toLowerCase();

  if (!normalized) return null;
  if (normalized.startsWith("86")) return "DTN_NB";
  if (normalized.startsWith("a84")) return "DTL_LORA";

  return null;
}

export function getKhompDeviceTypeLabel(type: KhompDeviceType): string {
  return type === "DTN_NB" ? "DTN NB" : "DTL LoRa";
}
