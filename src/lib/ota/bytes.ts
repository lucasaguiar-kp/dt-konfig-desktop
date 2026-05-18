export function hexStringToBytes(hex: string): number[] {
  const cleaned = hex.trim().replace(/[^0-9a-f]/gi, "");
  const padded = cleaned.length % 2 === 0 ? cleaned : `0${cleaned}`;
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    out.push(Number.parseInt(padded.slice(i, i + 2), 16));
  }
  return out;
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => (b & 0xff).toString(16).padStart(2, "0").toUpperCase()).join("");
}

export function packUint16LE(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff];
}

export function packUint32LE(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];
}

export function utf8ToBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toPrintableAscii(raw: string): string {
  const withNewlines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return withNewlines.replace(/[^\x20-\x7e\n]/g, ".");
}

export function normalizeBleUuid(uuid: string): string {
  const compact = uuid.trim().replace(/-/g, "").toLowerCase();
  if (compact.length === 4) {
    return `0000${compact}-0000-1000-8000-00805f9b34fb`;
  }
  if (compact.length === 8) {
    return `${compact}-0000-1000-8000-00805f9b34fb`;
  }
  if (compact.length === 32) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(
      16,
      20,
    )}-${compact.slice(20)}`;
  }
  return uuid.trim().toLowerCase();
}

export function getBleUuidCandidates(uuid: string): string[] {
  const raw = uuid.trim().toLowerCase();
  const normalized = normalizeBleUuid(uuid);
  const compact = normalized.replace(/-/g, "");
  const baseSuffix = "00001000800000805f9b34fb";
  const shortUuid = compact.length === 32 && compact.startsWith("0000") && compact.endsWith(baseSuffix)
    ? compact.slice(4, 8)
    : "";

  return Array.from(new Set([raw, normalized, shortUuid].filter(Boolean)));
}
