import type { OtaBleSession } from "../ble-session";
import { throwIfAborted } from "../abort";
import { utf8ToBytes } from "../bytes";
import {
  DEFAULT_UUID,
  PASSWORD_ERROR_PATTERNS,
  SYNC_MAX_RETRIES,
  SYNC_MAX_SILENT_ATTEMPTS,
  SYNC_SUCCESS_PATTERNS,
  SYNC_TIMEOUT_MS,
} from "../constants";
import { otaWarn } from "../logger";
import { buildSyncCommand, derivePasswordUuid } from "../protocol";

type SyncUuidCandidate = { uuid: string; label: string };

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

/**
 * The UUIDs the handshake alternates through, mirroring the proven mobile app and the reference
 * host script: the password-derived UUID and the factory EUI. One of the two is echoed back when
 * the device accepts the sync.
 */
function buildUuidRotation(password: string): SyncUuidCandidate[] {
  return [
    { uuid: derivePasswordUuid(password), label: "senha" },
    { uuid: DEFAULT_UUID, label: "EUI default" },
  ];
}

export async function runSyncHandshake(
  session: OtaBleSession,
  serviceUuid: string,
  writeCharUuid: string,
  password: string,
  signal?: AbortSignal,
  onTrace?: (message: string) => void,
): Promise<string> {
  throwIfAborted(signal);
  const rotation = buildUuidRotation(password);
  // Surface every UUID candidate up front so the console shows exactly what reaches the device.
  onTrace?.(`SYNC candidatos (de "${password}"): ${rotation.map((c) => `${c.uuid} [${c.label}]`).join(", ")}`);
  let silentAttempts = 0;
  let passwordErrorCount = 0;

  // The device rejects a sync with "Password Incorrect" — this is NOT terminal. The proven mobile
  // app keeps alternating UUIDs and retrying until one is echoed back, so we do the same.
  const registerPasswordError = (attempt: number) => {
    passwordErrorCount += 1;
    silentAttempts = 0;
    onTrace?.(`SYNC tentativa ${attempt} recusada (Password Incorrect) — retentando (#${passwordErrorCount}).`);
  };

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
    const candidate = rotation[(attempt - 1) % rotation.length];
    const currentUuid = candidate.uuid;
    onTrace?.(`SYNC tentativa ${attempt}/${SYNC_MAX_RETRIES}: uuid=${currentUuid} (${candidate.label})`);
    let response = await sendSyncAndWait(currentUuid, "\r\n", false);

    if (response.status === "match") return currentUuid;

    if (response.status === "password_error") {
      registerPasswordError(attempt);
      continue;
    }

    if (hasAtError(response.ascii.toUpperCase())) {
      throwIfAborted(signal);
      otaWarn("SYNC returned modem ERROR. Retrying with CR line ending and writeWithoutResponse.");
      response = await sendSyncAndWait(currentUuid, "\r", true);
      if (response.status === "match") return currentUuid;
      if (response.status === "password_error") {
        registerPasswordError(attempt);
        continue;
      }
    }

    // No usable response at all. Bail early only if the device has been silent for several
    // attempts in a row — that means it is out of range or powered off, and burning through
    // every remaining retry would just stall the UI.
    silentAttempts += 1;
    onTrace?.(`SYNC tentativa ${attempt} sem resposta (${silentAttempts}/${SYNC_MAX_SILENT_ATTEMPTS}).`);
    if (silentAttempts >= SYNC_MAX_SILENT_ATTEMPTS) {
      throw new Error("Sync falhou: o dispositivo não respondeu. Verifique se ele está ligado e próximo.");
    }
  }

  throw new Error(
    `Sync falhou: o dispositivo respondeu mas recusou o handshake nas ${SYNC_MAX_RETRIES} tentativas.`,
  );
}
