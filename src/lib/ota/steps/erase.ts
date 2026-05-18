import type { OtaBleSession } from "../ble-session";
import { abortableDelay, throwIfAborted } from "../abort";
import { CMD_MAX_RETRIES, CMD_TIMEOUT_MS, FLASH_BASE_ADDR } from "../constants";
import { buildEraseCommand } from "../protocol";

export async function eraseFlash(
  session: OtaBleSession,
  serviceUuid: string,
  writeCharUuid: string,
  activeUuid: string,
  fileSize: number,
  signal?: AbortSignal,
): Promise<void> {
  await abortableDelay(200, signal);
  const command = buildEraseCommand(activeUuid, FLASH_BASE_ADDR, fileSize);

  for (let attempt = 1; attempt <= CMD_MAX_RETRIES; attempt += 1) {
    throwIfAborted(signal);
    session.clearNotificationBuffer();
    await session.write(serviceUuid, writeCharUuid, command);
    throwIfAborted(signal);

    const response = await session.waitFor(CMD_TIMEOUT_MS, (asciiUpper, hexUpper) => {
      if (asciiUpper.includes(activeUuid.toUpperCase())) return "match";
      if (hexUpper.includes(activeUuid.toUpperCase())) return "match";
      return "continue";
    }, signal);

    if (response.status === "match") {
      await abortableDelay(100, signal);
      return;
    }

    if (attempt === CMD_MAX_RETRIES) {
      throw new Error(`Erase failed after ${CMD_MAX_RETRIES} attempts: no response from device.`);
    }
  }
}
