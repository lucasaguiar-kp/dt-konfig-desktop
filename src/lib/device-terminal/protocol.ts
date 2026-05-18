import type { KhompDeviceType } from "../constants";

const MILLISECONDS_MULTIPLIER = 1000;

function ensureCommandLineEnding(value: string): string {
  if (value.endsWith("\r") || value.endsWith("\n")) {
    return value;
  }

  return `${value}\r\n`;
}

export function utf8ToBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

export function bytesToPrintableAscii(bytes: number[]): string {
  return bytes
    .map((byte) => {
      const normalizedByte = Number(byte) & 0xff;
      if (normalizedByte === 10 || normalizedByte === 13 || normalizedByte === 9) {
        return String.fromCharCode(normalizedByte);
      }

      if (normalizedByte >= 32 && normalizedByte <= 126) {
        return String.fromCharCode(normalizedByte);
      }

      return ".";
    })
    .join("");
}

export function normalizeBleUuid(uuid: string): string {
  const normalizedUuid = uuid.toLowerCase();
  const shortUuidMatch = normalizedUuid.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);

  return shortUuidMatch?.[1] ?? normalizedUuid;
}

export function formatDeviceCommand(
  command: string,
  value = "",
  deviceType: KhompDeviceType | null = null,
): string {
  const trimmedCommand = command.trim();
  const trimmedValue = value.trim();

  if (!trimmedCommand && trimmedValue) {
    return ensureCommandLineEnding(trimmedValue);
  }

  if (!trimmedCommand) {
    return "";
  }

  if (!trimmedCommand.includes("=")) {
    return ensureCommandLineEnding(trimmedCommand);
  }

  if (trimmedCommand === "AT+CCLK=") {
    return ensureCommandLineEnding(`${trimmedCommand}"${trimmedValue}"`);
  }

  if (trimmedCommand === "AT+TDC=" && deviceType === "DTL_LORA") {
    const numericValue = Number(trimmedValue);
    if (Number.isFinite(numericValue)) {
      return ensureCommandLineEnding(`${trimmedCommand}${(numericValue * MILLISECONDS_MULTIPLIER).toString()}`);
    }
  }

  return ensureCommandLineEnding(`${trimmedCommand}${trimmedValue}`);
}

export function buildDeviceCommandBytes(
  command: string,
  value = "",
  deviceType: KhompDeviceType | null = null,
): number[] {
  const formattedCommand = formatDeviceCommand(command, value, deviceType);
  return utf8ToBytes(formattedCommand);
}
