import type { BleClient, BleDevice } from "../ble/types";
import { createCancelError, throwIfAborted } from "./abort";
import { OtaBleSession } from "./ble-session";
import { DEFAULT_WRITE_CHAR_UUID, FLASH_BASE_ADDR, IMEI_SEARCH_TIMEOUT_MS, OTA_MAX_WRITE_BYTES } from "./constants";
import { validateFirmwareFile } from "./file";
import { otaWarn } from "./logger";
import { eraseFlash } from "./steps/erase";
import { flashFirmware } from "./steps/flash";
import { queryBootloaderVersion } from "./steps/get-version";
import { rebootDevice } from "./steps/reboot";
import { runSyncHandshake } from "./steps/sync";
import type { OtaFlashStats, OtaParams } from "./types";

function normalizeImei(value: string): string {
  return value.trim().toLowerCase();
}

// Match the home scan, which identifies Khomp devices by `name ?? localName`. Some devices
// advertise the IMEI only in the localName (with name absent or the literal string "NULL"),
// so we compare the entered IMEI/BLE name against BOTH fields.
function isImeiDevice(device: BleDevice, imei: string): boolean {
  const target = normalizeImei(imei);
  if (!target) return false;
  return normalizeImei(device.name ?? "") === target || normalizeImei(device.localName ?? "") === target;
}

function userMessageForError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "OTA failed. Check that the device is powered, nearby, and in upgrade mode.";
}

export function mapFlashProgressToOtaProgress(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return Number.parseFloat((40 + (clamped / 100) * 55).toFixed(2));
}

function formatFlashStats(stats: OtaFlashStats): string {
  const writtenKb = stats.written / 1024;
  const totalKb = stats.total / 1024;
  const speedKb = stats.speedBytesPerSecond / 1024;
  const remainingBytes = Math.max(0, stats.total - stats.written);
  const remainingSeconds = stats.speedBytesPerSecond > 0 ? remainingBytes / stats.speedBytesPerSecond : 0;
  const remainingLabel =
    remainingSeconds >= 60
      ? `${Math.ceil(remainingSeconds / 60)}min`
      : `${Math.ceil(remainingSeconds)}s`;

  return `Flash ${stats.percent.toFixed(0)}%: ${writtenKb.toFixed(1)}/${totalKb.toFixed(1)} KB, ${speedKb.toFixed(1)} KB/s, bloco ${stats.chunkSize} B, ETA ${remainingLabel}`;
}

export async function findDeviceByImei({
  bleClient,
  imei,
  timeoutMs = IMEI_SEARCH_TIMEOUT_MS,
  signal,
  onTrace,
}: {
  bleClient: Pick<BleClient, "startScan" | "stopScan" | "onDeviceDiscovered">;
  imei: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onTrace?: (message: string) => void;
}): Promise<BleDevice> {
  const normalizedImei = imei.trim();
  if (!normalizedImei) throw new Error("IMEI is required to find the OTA device.");
  throwIfAborted(signal);

  return new Promise<BleDevice>((resolve, reject) => {
    let settled = false;
    let unlisten: (() => void) | null = null;
    let timer: number | null = null;
    let abortHandler: (() => void) | null = null;
    const seenDeviceIds = new Set<string>();

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
        onTrace?.("BLE scan stop...");
        await bleClient.stopScan();
        onTrace?.("BLE scan stop OK.");
      } catch (error) {
        onTrace?.(`BLE scan stop falhou: ${userMessageForError(error)}`);
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

    abortHandler = () => {
      onTrace?.("BLE scan cancelado pelo usuario.");
      finish(() => reject(createCancelError()));
    };
    signal?.addEventListener("abort", abortHandler, { once: true });

    onTrace?.(`BLE scan preparando listener para IMEI ${normalizedImei}...`);
    bleClient
      .onDeviceDiscovered((device) => {
        if (settled) return;
        const deviceKey = device.id || `${device.name ?? ""}:${device.localName ?? ""}`;
        if (!seenDeviceIds.has(deviceKey)) {
          seenDeviceIds.add(deviceKey);
          onTrace?.(
            `BLE scan viu device: id=${device.id}, name=${device.name ?? "sem nome"}, local=${device.localName ?? "sem local"}, rssi=${device.rssi}`,
          );
        }
        if (!isImeiDevice(device, normalizedImei)) return;
        onTrace?.(`BLE scan match IMEI: id=${device.id}, rssi=${device.rssi}`);
        finish(() => resolve(device));
      })
      .then(async (listener) => {
        if (settled) {
          listener();
          return;
        }
        unlisten = listener;
        onTrace?.("BLE scan listener registrado.");
        if (signal?.aborted) {
          finish(() => reject(createCancelError()));
          return;
        }
        try {
          onTrace?.("BLE scan start...");
          await bleClient.startScan();
          onTrace?.("BLE scan start OK.");
        } catch (error) {
          onTrace?.(`BLE scan start falhou: ${userMessageForError(error)}`);
          finish(() => reject(error));
          return;
        }
        if (settled) return;
        timer = window.setTimeout(() => {
          onTrace?.(`BLE scan timeout: nenhum device com nome "${normalizedImei}" em ${Math.round(timeoutMs / 1000)}s.`);
          finish(() => reject(new Error(`No BLE device named "${normalizedImei}" was found within 90 seconds.`)));
        }, timeoutMs);
      })
      .catch((error) => {
        onTrace?.(`BLE scan listener falhou: ${userMessageForError(error)}`);
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
  onTrace,
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
    const device = await findDeviceByImei({ bleClient, imei, signal, onTrace });
    onTrace?.(`BLE device encontrado: id=${device.id}, name=${device.name ?? "sem nome"}, rssi=${device.rssi}`);

    throwIfAborted(signal);
    session = new OtaBleSession(bleClient, device.id, OTA_MAX_WRITE_BYTES, onTrace);

    onStatus?.("Connecting to BLE device...");
    await session.connect();
    onTrace?.("BLE conectado.");

    throwIfAborted(signal);
    onStatus?.("Discovering OTA services...");
    const discovery = await session.discoverUuids(serviceUuid, charUuid, txCharUuid);
    onTrace?.(`BLE write characteristic: service=${discovery.uuids.serviceUuid}, char=${discovery.uuids.writeCharUuid}`);
    onTrace?.(`BLE notify targets: ${discovery.notifyTargets.map((target) => target.charUuid).join(", ")}`);
    await session.startPersistentListener();

    throwIfAborted(signal);
    onStatus?.("Enabling notifications...");
    await session.enableNotifications(discovery.notifyTargets);

    const writeCharUuid = discovery.uuids.writeCharUuid;
    throwIfAborted(signal);
    onStatus?.("Synchronizing with bootloader...");
    const activeUuid = await runSyncHandshake(session, discovery.uuids.serviceUuid, writeCharUuid, normalizedPassword, signal, onTrace);

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
      (stats) => {
        onStatus?.(formatFlashStats(stats));
      },
      onTrace,
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
