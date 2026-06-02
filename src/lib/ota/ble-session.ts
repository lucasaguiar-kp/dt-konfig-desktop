import type { BleCharacteristic, BleClient, BleNotification } from "../ble/types";
import { abortableDelay, throwIfAborted } from "./abort";
import { bytesToHex, getBleUuidCandidates, normalizeBleUuid, toPrintableAscii } from "./bytes";
import {
  BLE_WRITE_TIMEOUT_MS,
  DEFAULT_MAX_WRITE_BYTES,
  DEFAULT_NOTIFY_CHAR_UUID,
  DEFAULT_SERVICE_UUID,
  DEFAULT_WRITE_CHAR_UUID,
} from "./constants";
import { otaLog, otaWarn } from "./logger";
import type { BleUuidPair, NotificationTarget, OtaUuids, WaitResponseResult } from "./types";

const TRACE_ASCII_PREVIEW_LENGTH = 96;
const TRACE_HEX_PREVIEW_LENGTH = 96;
const BOOTLOADER_BANNER_PATTERN = /DRAGINO NB bootloader v[^\s\r\n"]+/i;

function pushUniquePair<T extends { serviceUuid: string; charUuid: string }>(list: T[], value: T): void {
  if (list.some((item) => item.serviceUuid === value.serviceUuid && item.charUuid === value.charUuid)) {
    return;
  }
  list.push(value);
}

function characteristicPair(characteristic: BleCharacteristic): BleUuidPair {
  return {
    serviceUuid: normalizeBleUuid(characteristic.serviceUuid),
    charUuid: normalizeBleUuid(characteristic.characteristicUuid),
  };
}

async function withWriteTimeout(operation: Promise<void>, timeoutMs = BLE_WRITE_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`BLE write timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : String(error);
}

function commandName(command: number): string {
  switch (command) {
    case 0x01:
      return "SYNC";
    case 0x03:
      return "FLASH";
    case 0x04:
      return "ERASE";
    case 0x0c:
      return "REBOOT";
    case 0x13:
      return "GET_VERSION";
    default:
      return `0x${command.toString(16).padStart(2, "0")}`;
  }
}

function bytesFromHex(value: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 2) {
    bytes.push(Number.parseInt(value.slice(index, index + 2), 16));
  }
  return bytes;
}

function describeTxPayload(data: number[], maxWriteBytes: number): string {
  const fragmentCount = Math.ceil(data.length / maxWriteBytes);
  const asciiRaw = String.fromCharCode(...data);
  const atMatch = asciiRaw.match(/^AT\+TX=(\d+),([0-9a-fA-F]+)/);

  if (!atMatch) {
    return `raw=${data.length}B, fragments=${fragmentCount}x${maxWriteBytes}B, payload redigido`;
  }

  const packetLength = Number.parseInt(atMatch[1], 10);
  const packetBytes = bytesFromHex(atMatch[2]);
  const command = packetBytes[1] ?? 0;
  const payloadLength = packetBytes.length >= 12 ? packetBytes[10] | (packetBytes[11] << 8) : 0;
  const firmwareBytes = command === 0x03 ? Math.max(0, payloadLength - 8) : null;
  const firmwareLabel = firmwareBytes === null ? "" : `, firmware=${firmwareBytes}B`;

  return `AT+TX ${commandName(command)}, packet=${packetLength}B, payload=${payloadLength}B${firmwareLabel}, encoded=${data.length}B, fragments=${fragmentCount}x${maxWriteBytes}B`;
}

export class OtaBleSession {
  private notificationUnlisten: (() => void) | null = null;
  private enabledNotifyTargets: NotificationTarget[] = [];
  private asciiBuffer = "";
  private hexBuffer = "";
  private lastBootloaderBanner: string | null = null;

  constructor(
    private readonly bleClient: BleClient,
    private readonly deviceId: string,
    private readonly maxWriteBytes = DEFAULT_MAX_WRITE_BYTES,
    private readonly onTrace?: (message: string) => void,
  ) {}

  getMaxWriteBytes(): number {
    return this.maxWriteBytes;
  }

  async connect(): Promise<void> {
    const startedAt = Date.now();
    this.onTrace?.(`BLE connect start: device=${this.deviceId}`);
    try {
      await this.bleClient.connect(this.deviceId);
      this.onTrace?.(`BLE connect OK em ${Date.now() - startedAt}ms`);
    } catch (error) {
      this.onTrace?.(`BLE connect falhou em ${Date.now() - startedAt}ms: ${errorMessage(error)}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.onTrace?.("BLE disconnect iniciando...");
    await this.stopPersistentListener();
    await this.stopEnabledNotifications();
    await this.bleClient.disconnect(this.deviceId);
    this.onTrace?.("BLE disconnect OK.");
  }

  clearNotificationBuffer(): void {
    this.asciiBuffer = "";
    this.hexBuffer = "";
    this.lastBootloaderBanner = null;
  }

  getNotificationSnapshot(): { ascii: string; hex: string } {
    return { ascii: this.asciiBuffer, hex: this.hexBuffer };
  }

  async discoverUuids(
    requestedServiceUuid = DEFAULT_SERVICE_UUID,
    requestedNotifyUuid = DEFAULT_NOTIFY_CHAR_UUID,
    requestedWriteUuid = DEFAULT_WRITE_CHAR_UUID,
  ): Promise<{
    uuids: OtaUuids;
    notifyTargets: NotificationTarget[];
    writeCandidates: BleUuidPair[];
  }> {
    let serviceUuid = normalizeBleUuid(requestedServiceUuid);
    let notifyCharUuid = normalizeBleUuid(requestedNotifyUuid);
    let writeCharUuid = normalizeBleUuid(requestedWriteUuid);

    const notifyCandidates: BleUuidPair[] = [];
    const writeNotifyCandidates: BleUuidPair[] = [];
    const writeOnlyCandidates: BleUuidPair[] = [];

    const characteristics = await this.bleClient.services(this.deviceId);
    otaLog(`Services discovered: ${characteristics.length} characteristics`);
    this.onTrace?.(`BLE services: ${characteristics.length} characteristics encontradas.`);

    for (const characteristic of characteristics) {
      const props = characteristic.properties;
      const hasNotify = props.notify || props.indicate;
      const hasWrite = props.write || props.writeWithoutResponse;
      const candidate = characteristicPair(characteristic);
      this.onTrace?.(
        `BLE char service=${candidate.serviceUuid}, char=${candidate.charUuid}, props notify=${props.notify}, indicate=${props.indicate}, write=${props.write}, writeWithoutResponse=${props.writeWithoutResponse}`,
      );

      if (hasNotify) {
        pushUniquePair(notifyCandidates, candidate);
      }
      if (hasWrite && hasNotify) {
        pushUniquePair(writeNotifyCandidates, candidate);
      } else if (hasWrite) {
        pushUniquePair(writeOnlyCandidates, candidate);
      }
    }

    const requestedWrite = [...writeNotifyCandidates, ...writeOnlyCandidates].find(
      (c) => c.charUuid === normalizeBleUuid(requestedWriteUuid) && c.serviceUuid === serviceUuid,
    );
    const serviceAlignedWriteNotify = writeNotifyCandidates.find((c) => c.serviceUuid === serviceUuid);
    const selectedWrite = requestedWrite ?? serviceAlignedWriteNotify ?? writeNotifyCandidates[0] ?? writeOnlyCandidates[0];

    if (selectedWrite) {
      serviceUuid = selectedWrite.serviceUuid;
      writeCharUuid = selectedWrite.charUuid;
    }

    const selectedNotify =
      notifyCandidates.find((c) => c.serviceUuid === serviceUuid) ??
      notifyCandidates[0] ??
      writeNotifyCandidates.find((c) => c.serviceUuid === serviceUuid) ??
      writeNotifyCandidates[0];

    if (selectedNotify) {
      notifyCharUuid = selectedNotify.charUuid;
    }
    this.onTrace?.(`BLE selected write: service=${serviceUuid}, char=${writeCharUuid}`);
    this.onTrace?.(`BLE selected notify: service=${serviceUuid}, char=${notifyCharUuid}`);

    const notifyTargets: NotificationTarget[] = [];
    pushUniquePair(notifyTargets, { serviceUuid, charUuid: notifyCharUuid });
    for (const candidate of notifyCandidates) pushUniquePair(notifyTargets, candidate);
    for (const candidate of writeNotifyCandidates) pushUniquePair(notifyTargets, candidate);

    return {
      uuids: { serviceUuid, notifyCharUuid, writeCharUuid },
      notifyTargets,
      writeCandidates: [...writeNotifyCandidates, ...writeOnlyCandidates],
    };
  }

  async startPersistentListener(): Promise<void> {
    await this.stopPersistentListener();
    this.clearNotificationBuffer();
    this.onTrace?.("BLE notification event listener iniciando...");
    this.notificationUnlisten = await this.bleClient.onNotification((notification) => this.onNotification(notification));
    this.onTrace?.("BLE notification event listener OK.");
  }

  async stopPersistentListener(): Promise<void> {
    if (!this.notificationUnlisten) return;
    this.onTrace?.("BLE notification event listener parando...");
    this.notificationUnlisten();
    this.notificationUnlisten = null;
    this.onTrace?.("BLE notification event listener parado.");
  }

  private onNotification(notification: BleNotification): void {
    if (notification.deviceId !== this.deviceId) return;
    if (notification.value.length === 0) return;

    const hex = bytesToHex(notification.value);
    const asciiRaw = String.fromCharCode(...notification.value);
    const printable = toPrintableAscii(asciiRaw);

    this.asciiBuffer += asciiRaw;
    this.hexBuffer += hex;
    const bootloaderBanner = this.asciiBuffer.match(BOOTLOADER_BANNER_PATTERN)?.[0] ?? null;
    if (bootloaderBanner && bootloaderBanner !== this.lastBootloaderBanner) {
      this.lastBootloaderBanner = bootloaderBanner;
      this.onTrace?.(`BOOTLOADER banner recebido: ${bootloaderBanner}`);
    }
    this.onTrace?.(
      `RX notify ${notification.value.length}B ASCII="${printable.substring(0, TRACE_ASCII_PREVIEW_LENGTH)}" HEX=${hex.substring(0, TRACE_HEX_PREVIEW_LENGTH)}`,
    );
    otaLog(`RX ${notification.value.length}B ASCII="${printable.substring(0, 120)}" HEX="${hex.substring(0, 120)}"`);
  }

  async enableNotifications(targets: NotificationTarget[]): Promise<void> {
    let enabledCount = 0;

    for (const target of targets) {
      try {
        this.onTrace?.(`BLE startNotify target: service=${target.serviceUuid}, char=${target.charUuid}`);
        const enabledTarget = await this.startNotificationWithFallback(target.serviceUuid, target.charUuid);
        this.onTrace?.(`BLE startNotify OK: service=${enabledTarget.serviceUuid}, char=${enabledTarget.charUuid}`);
        pushUniquePair(this.enabledNotifyTargets, enabledTarget);
        enabledCount += 1;
      } catch (err) {
        this.onTrace?.(`BLE startNotify falhou: service=${target.serviceUuid}, char=${target.charUuid}, erro=${errorMessage(err)}`);
        otaWarn(`startNotify failed for service="${target.serviceUuid}" char="${target.charUuid}"`, err);
      }
    }

    if (enabledCount === 0) {
      throw new Error("Could not enable BLE notifications for the OTA device.");
    }
  }

  private async startNotificationWithFallback(serviceUuid: string, charUuid: string): Promise<NotificationTarget> {
    const serviceCandidates = getBleUuidCandidates(serviceUuid);
    const charCandidates = getBleUuidCandidates(charUuid);
    let lastError: unknown = null;

    for (const svc of serviceCandidates) {
      for (const ch of charCandidates) {
        try {
          this.onTrace?.(`BLE startNotify tentativa: service=${svc}, char=${ch}`);
          await this.bleClient.startNotify(this.deviceId, svc, ch);
          return { serviceUuid: svc, charUuid: ch };
        } catch (err) {
          this.onTrace?.(`BLE startNotify tentativa falhou: service=${svc}, char=${ch}, erro=${errorMessage(err)}`);
          lastError = err;
        }
      }
    }

    throw lastError ?? new Error("startNotify failed for all UUID variants.");
  }

  private async stopEnabledNotifications(): Promise<void> {
    const targets = [...this.enabledNotifyTargets];
    this.enabledNotifyTargets = [];

    for (const target of targets) {
      try {
        this.onTrace?.(`BLE stopNotify: service=${target.serviceUuid}, char=${target.charUuid}`);
        await this.bleClient.stopNotify(this.deviceId, target.serviceUuid, target.charUuid);
        this.onTrace?.(`BLE stopNotify OK: service=${target.serviceUuid}, char=${target.charUuid}`);
      } catch (err) {
        this.onTrace?.(`BLE stopNotify falhou: service=${target.serviceUuid}, char=${target.charUuid}, erro=${errorMessage(err)}`);
        otaWarn(`stopNotify failed for service="${target.serviceUuid}" char="${target.charUuid}"`, err);
      }
    }
  }

  async write(serviceUuid: string, charUuid: string, data: number[], preferNoResponse = false): Promise<void> {
    const maxWriteBytes = this.getMaxWriteBytes();
    const payloadSummary = describeTxPayload(data, maxWriteBytes);

    if (preferNoResponse) {
      const startedAt = Date.now();
      this.onTrace?.(`TX writeWithoutResponse ${payloadSummary}`);
      try {
        await withWriteTimeout(
          this.bleClient.writeWithoutResponse(this.deviceId, serviceUuid, charUuid, data, maxWriteBytes),
        );
        this.onTrace?.(`TX writeWithoutResponse OK em ${Date.now() - startedAt}ms`);
        return;
      } catch (err) {
        this.onTrace?.(`TX writeWithoutResponse falhou em ${Date.now() - startedAt}ms: ${errorMessage(err)}; tentando write`);
        otaWarn("writeWithoutResponse failed, trying write", err);
      }
    }

    const writeStartedAt = Date.now();
    this.onTrace?.(`TX write ${payloadSummary}`);
    try {
      await withWriteTimeout(this.bleClient.write(this.deviceId, serviceUuid, charUuid, data, maxWriteBytes));
      this.onTrace?.(`TX write OK em ${Date.now() - writeStartedAt}ms`);
      return;
    } catch (err) {
      if (preferNoResponse) {
        this.onTrace?.(`TX write falhou em ${Date.now() - writeStartedAt}ms: ${errorMessage(err)}`);
        throw err;
      }
      this.onTrace?.(`TX write falhou em ${Date.now() - writeStartedAt}ms: ${errorMessage(err)}; tentando writeWithoutResponse`);
      otaWarn("write failed, trying writeWithoutResponse", err);
    }

    const fallbackStartedAt = Date.now();
    this.onTrace?.(`TX writeWithoutResponse ${payloadSummary}`);
    await withWriteTimeout(
      this.bleClient.writeWithoutResponse(this.deviceId, serviceUuid, charUuid, data, maxWriteBytes),
    );
    this.onTrace?.(`TX writeWithoutResponse OK em ${Date.now() - fallbackStartedAt}ms`);
  }

  async waitFor(
    timeoutMs: number,
    matcher: (asciiUpper: string, hexUpper: string) => "match" | "password_error" | "continue",
    signal?: AbortSignal,
  ): Promise<WaitResponseResult> {
    throwIfAborted(signal);
    const started = Date.now();
    this.onTrace?.(`WAIT notify ate ${timeoutMs}ms...`);
    while (Date.now() - started < timeoutMs) {
      throwIfAborted(signal);
      const asciiUpper = this.asciiBuffer.toUpperCase();
      const hexUpper = this.hexBuffer.toUpperCase();
      const state = matcher(asciiUpper, hexUpper);
      if (state === "match") {
        this.onTrace?.(`WAIT match em ${Date.now() - started}ms, ascii=${this.asciiBuffer.length}B, hex=${this.hexBuffer.length} chars`);
        return { status: "match", ascii: this.asciiBuffer, hex: this.hexBuffer };
      }
      if (state === "password_error") {
        this.onTrace?.(`WAIT password_error em ${Date.now() - started}ms, ascii=${this.asciiBuffer.length}B`);
        return { status: "password_error", ascii: this.asciiBuffer, hex: this.hexBuffer };
      }
      await abortableDelay(5, signal);
    }

    this.onTrace?.(`WAIT timeout apos ${timeoutMs}ms, ascii=${this.asciiBuffer.length}B, hex=${this.hexBuffer.length} chars`);
    return { status: "timeout", ascii: this.asciiBuffer, hex: this.hexBuffer };
  }
}
