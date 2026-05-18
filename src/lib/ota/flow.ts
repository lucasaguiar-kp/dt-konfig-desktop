import type { BleClient, BleDevice } from "../ble/types";
import { createCancelError, throwIfAborted } from "./abort";
import { OtaBleSession } from "./ble-session";
import { DEFAULT_WRITE_CHAR_UUID, FLASH_BASE_ADDR, IMEI_SEARCH_TIMEOUT_MS } from "./constants";
import { validateFirmwareFile } from "./file";
import { otaWarn } from "./logger";
import { eraseFlash } from "./steps/erase";
import { flashFirmware } from "./steps/flash";
import { queryBootloaderVersion } from "./steps/get-version";
import { rebootDevice } from "./steps/reboot";
import { runSyncHandshake } from "./steps/sync";
import type { OtaParams } from "./types";

function normalizeImei(value: string): string {
  return value.trim().toLowerCase();
}

function isImeiDevice(device: BleDevice, imei: string): boolean {
  return normalizeImei(device.name ?? "") === normalizeImei(imei);
}

function userMessageForError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "OTA failed. Check that the device is powered, nearby, and in upgrade mode.";
}

export function mapFlashProgressToOtaProgress(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return Number.parseFloat((40 + (clamped / 100) * 55).toFixed(2));
}

export async function findDeviceByImei({
  bleClient,
  imei,
  timeoutMs = IMEI_SEARCH_TIMEOUT_MS,
  signal,
}: {
  bleClient: Pick<BleClient, "startScan" | "stopScan" | "onDeviceDiscovered">;
  imei: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<BleDevice> {
  const normalizedImei = imei.trim();
  if (!normalizedImei) throw new Error("IMEI is required to find the OTA device.");
  throwIfAborted(signal);

  return new Promise<BleDevice>((resolve, reject) => {
    let settled = false;
    let unlisten: (() => void) | null = null;
    let timer: number | null = null;
    let abortHandler: (() => void) | null = null;

    const cleanup = async () => {
      if (abortHandler) {
        signal?.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      try {
        await bleClient.stopScan();
      } catch (error) {
        otaWarn("Unable to stop BLE scan after OTA search.", error);
      }
    };

    const finish = (afterCleanup: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      void cleanup().finally(afterCleanup);
    };

    abortHandler = () => finish(() => reject(createCancelError()));
    signal?.addEventListener("abort", abortHandler, { once: true });

    bleClient
      .onDeviceDiscovered((device) => {
        if (settled || !isImeiDevice(device, normalizedImei)) return;
        finish(() => resolve(device));
      })
      .then(async (listener) => {
        if (settled) {
          listener();
          return;
        }
        unlisten = listener;
        if (signal?.aborted) {
          finish(() => reject(createCancelError()));
          return;
        }
        try {
          await bleClient.startScan();
        } catch (error) {
          finish(() => reject(error));
          return;
        }
        if (settled) return;
        timer = window.setTimeout(() => {
          finish(() => reject(new Error(`No BLE device named "${normalizedImei}" was found within 90 seconds.`)));
        }, timeoutMs);
      })
      .catch((error) => {
        finish(() => reject(error));
      });
  });
}

export async function startDtnNbOta({
  bleClient,
  imei,
  password,
  file,
  serviceUuid,
  charUuid,
  txCharUuid = DEFAULT_WRITE_CHAR_UUID,
  signal,
  onProgress,
  onStatus,
}: OtaParams): Promise<void> {
  const normalizedPassword = password.trim();
  if (!normalizedPassword) throw new Error("OTA password is required.");

  let session: OtaBleSession | null = null;

  try {
    throwIfAborted(signal);
    onStatus?.("Validating firmware file...");
    const { data: fileData, size: fileSize } = await validateFirmwareFile(file);

    throwIfAborted(signal);
    onStatus?.("Scanning for device by IMEI...");
    const device = await findDeviceByImei({ bleClient, imei, signal });

    throwIfAborted(signal);
    session = new OtaBleSession(bleClient, device.id);

    onStatus?.("Connecting to BLE device...");
    await session.connect();

    throwIfAborted(signal);
    onStatus?.("Discovering OTA services...");
    const discovery = await session.discoverUuids(serviceUuid, charUuid, txCharUuid);
    await session.startPersistentListener();

    throwIfAborted(signal);
    onStatus?.("Enabling notifications...");
    await session.enableNotifications(discovery.notifyTargets);

    const writeCharUuid = discovery.uuids.writeCharUuid;
    throwIfAborted(signal);
    onStatus?.("Synchronizing with bootloader...");
    const activeUuid = await runSyncHandshake(session, discovery.uuids.serviceUuid, writeCharUuid, normalizedPassword, signal);

    throwIfAborted(signal);
    onStatus?.("Reading bootloader version...");
    await queryBootloaderVersion(session, discovery.uuids.serviceUuid, writeCharUuid, activeUuid, signal);

    throwIfAborted(signal);
    onStatus?.("Erasing flash...");
    await eraseFlash(session, discovery.uuids.serviceUuid, writeCharUuid, activeUuid, fileSize, signal);

    throwIfAborted(signal);
    onProgress?.(40);
    onStatus?.("Flashing firmware...");
    await flashFirmware(
      session,
      discovery.uuids.serviceUuid,
      writeCharUuid,
      activeUuid,
      FLASH_BASE_ADDR,
      fileData,
      (percent) => {
        onProgress?.(mapFlashProgressToOtaProgress(percent));
      },
      signal,
    );

    throwIfAborted(signal);
    onStatus?.("Rebooting device...");
    await rebootDevice(session, discovery.uuids.serviceUuid, writeCharUuid, activeUuid, signal);

    throwIfAborted(signal);
    onProgress?.(100);
    onStatus?.("OTA completed.");
  } catch (error) {
    throw new Error(userMessageForError(error));
  } finally {
    await session?.disconnect().catch((error) => otaWarn("Unable to disconnect after OTA.", error));
  }
}
