import type { OtaBleSession } from "../ble-session";
import { throwIfAborted } from "../abort";
import { CMD_MAX_RETRIES, CMD_TIMEOUT_MS } from "../constants";
import { buildRebootCommand } from "../protocol";

export async function rebootDevice(
  session: OtaBleSession,
  serviceUuid: string,
  writeCharUuid: string,
  activeUuid: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const command = buildRebootCommand(activeUuid, 0);

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

    if (response.status === "match" || attempt === CMD_MAX_RETRIES) return;
  }
}
