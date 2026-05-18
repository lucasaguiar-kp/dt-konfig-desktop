import type { OtaBleSession } from "../ble-session";
import { throwIfAborted } from "../abort";
import { CHUNK_SIZE, CMD_TIMEOUT_MS } from "../constants";
import { buildFlashCommand } from "../protocol";

export async function flashFirmware(
  session: OtaBleSession,
  serviceUuid: string,
  writeCharUuid: string,
  activeUuid: string,
  baseAddress: number,
  fileData: number[],
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  let flashAddress = baseAddress;
  let written = 0;
  const total = fileData.length;

  while (written < total) {
    throwIfAborted(signal);
    const chunk = fileData.slice(written, written + CHUNK_SIZE);
    if (chunk.length === 0) break;

    const command = buildFlashCommand(activeUuid, flashAddress, chunk);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      throwIfAborted(signal);
      session.clearNotificationBuffer();
      await session.write(serviceUuid, writeCharUuid, command);
      throwIfAborted(signal);

      const response = await session.waitFor(CMD_TIMEOUT_MS, (asciiUpper, hexUpper) => {
        if (asciiUpper.includes(activeUuid.toUpperCase())) return "match";
        if (hexUpper.includes(activeUuid.toUpperCase())) return "match";
        if (asciiUpper.includes("PASSWORD ERROR") || asciiUpper.includes("PASSWORD INCORRECT")) return "password_error";
        return "continue";
      }, signal);

      if (response.status === "match") break;
      if (response.status === "password_error") throw new Error("Device returned password error during flash.");
      if (attempt === 2) throw new Error("Flash failed: no response from device.");
    }

    flashAddress += chunk.length;
    written += chunk.length;
    throwIfAborted(signal);
    onProgress?.(Number.parseFloat(((written * 100) / total).toFixed(2)));
  }
}
