import type { OtaBleSession } from "../ble-session";
import { throwIfAborted } from "../abort";
import { utf8ToBytes } from "../bytes";
import {
  DEFAULT_UUID,
  PASSWORD_ERROR_PATTERNS,
  SYNC_MAX_RETRIES,
  SYNC_SUCCESS_PATTERNS,
  SYNC_TIMEOUT_MS,
} from "../constants";
import { otaWarn } from "../logger";
import { buildSyncCommand, derivePasswordUuid } from "../protocol";

function hasPasswordError(asciiUpper: string): boolean {
  return PASSWORD_ERROR_PATTERNS.some((pattern) => asciiUpper.includes(pattern));
}

function hasAtError(asciiUpper: string): boolean {
  return asciiUpper.includes("ERROR");
}

export async function unlockAtSession(
  session: OtaBleSession,
  serviceUuid: string,
  writeCharUuid: string,
  password: string,
  signal?: AbortSignal,
): Promise<"ok" | "rejected" | "unknown"> {
  throwIfAborted(signal);
  const trimmed = password.trim();
  if (!trimmed) return "unknown";

  session.clearNotificationBuffer();
  await session.write(serviceUuid, writeCharUuid, utf8ToBytes(`${trimmed}\r\n`));
  throwIfAborted(signal);

  const result = await session.waitFor(2500, (asciiUpper) => {
    if (asciiUpper.includes("PASSWORD CORRECT")) return "match";
    if (asciiUpper.includes("PASSWORD INCORRECT")) return "password_error";
    return "continue";
  }, signal);

  if (result.status === "match") return "ok";
  if (result.status === "password_error") return "rejected";
  return "unknown";
}

export async function runSyncHandshake(
  session: OtaBleSession,
  serviceUuid: string,
  writeCharUuid: string,
  password: string,
  signal?: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);
  const passwordUuid = derivePasswordUuid(password);
  let currentUuid = DEFAULT_UUID;
  let passwordErrorCount = 0;

  const sendSyncAndWait = async (uuid: string, lineEnding: "\r\n" | "\r", preferNoResponse: boolean) => {
    const command = buildSyncCommand(uuid, lineEnding);
    session.clearNotificationBuffer();
    throwIfAborted(signal);
    await session.write(serviceUuid, writeCharUuid, command, preferNoResponse);
    throwIfAborted(signal);

    return session.waitFor(SYNC_TIMEOUT_MS, (asciiUpper, hexUpper) => {
      if (asciiUpper.includes(uuid.toUpperCase())) return "match";
      if (hexUpper.includes(uuid.toUpperCase())) return "match";
      if (SYNC_SUCCESS_PATTERNS.some((pattern) => asciiUpper.includes(pattern))) return "match";
      if (hasPasswordError(asciiUpper)) return "password_error";
      return "continue";
    }, signal);
  };

  for (let attempt = 1; attempt <= SYNC_MAX_RETRIES; attempt += 1) {
    throwIfAborted(signal);
    currentUuid = currentUuid === DEFAULT_UUID ? passwordUuid : DEFAULT_UUID;
    let response = await sendSyncAndWait(currentUuid, "\r\n", false);

    if (response.status === "match") return currentUuid;

    if (response.status === "password_error") {
      passwordErrorCount += 1;
      if (passwordErrorCount > 5) throw new Error("Sync failed: password error.");
      continue;
    }

    if (hasAtError(response.ascii.toUpperCase())) {
      throwIfAborted(signal);
      otaWarn("SYNC returned modem ERROR. Retrying with CR line ending and writeWithoutResponse.");
      response = await sendSyncAndWait(currentUuid, "\r", true);
      if (response.status === "match") return currentUuid;
      if (response.status === "password_error") {
        passwordErrorCount += 1;
        if (passwordErrorCount > 5) throw new Error("Sync failed: password error.");
      }
    }
  }

  throw new Error("Sync failed. Ensure the device is in upgrade mode and the password is correct.");
}
