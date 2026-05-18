import type { OtaBleSession } from "../ble-session";
import { throwIfAborted } from "../abort";
import { CMD_TIMEOUT_MS } from "../constants";
import { otaWarn } from "../logger";
import { buildGetVersionCommand } from "../protocol";

export async function queryBootloaderVersion(
  session: OtaBleSession,
  serviceUuid: string,
  writeCharUuid: string,
  activeUuid: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const command = buildGetVersionCommand(activeUuid, 0);
  session.clearNotificationBuffer();
  await session.write(serviceUuid, writeCharUuid, command);
  throwIfAborted(signal);

  const response = await session.waitFor(CMD_TIMEOUT_MS, (asciiUpper, hexUpper) => {
    if (asciiUpper.includes(activeUuid.toUpperCase())) return "match";
    if (hexUpper.includes(activeUuid.toUpperCase())) return "match";
    return "continue";
  }, signal);

  if (response.status === "timeout") {
    otaWarn(`Could not query bootloader version within ${CMD_TIMEOUT_MS}ms; continuing.`);
  }
}
