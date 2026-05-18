import type { BleCharacteristic, BleClient, BleNotification } from "../ble/types";
import { abortableDelay, throwIfAborted } from "./abort";
import { bytesToHex, getBleUuidCandidates, normalizeBleUuid, toPrintableAscii } from "./bytes";
import { DEFAULT_MAX_WRITE_BYTES, DEFAULT_NOTIFY_CHAR_UUID, DEFAULT_SERVICE_UUID, DEFAULT_WRITE_CHAR_UUID } from "./constants";
import { otaLog, otaWarn } from "./logger";
import type { BleUuidPair, NotificationTarget, OtaUuids, WaitResponseResult } from "./types";

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

export class OtaBleSession {
  private notificationUnlisten: (() => void) | null = null;
  private enabledNotifyTargets: NotificationTarget[] = [];
  private asciiBuffer = "";
  private hexBuffer = "";

  constructor(
    private readonly bleClient: BleClient,
    private readonly deviceId: string,
    private readonly maxWriteBytes = DEFAULT_MAX_WRITE_BYTES,
  ) {}

  getMaxWriteBytes(): number {
    return this.maxWriteBytes;
  }

  async connect(): Promise<void> {
    await this.bleClient.connect(this.deviceId);
  }

  async disconnect(): Promise<void> {
    await this.stopPersistentListener();
    await this.stopEnabledNotifications();
    await this.bleClient.disconnect(this.deviceId);
  }

  clearNotificationBuffer(): void {
    this.asciiBuffer = "";
    this.hexBuffer = "";
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

    for (const characteristic of characteristics) {
      const props = characteristic.properties;
      const hasNotify = props.notify || props.indicate;
      const hasWrite = props.write || props.writeWithoutResponse;
      const candidate = characteristicPair(characteristic);

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
    const selectedWrite = serviceAlignedWriteNotify ?? requestedWrite ?? writeNotifyCandidates[0] ?? writeOnlyCandidates[0];

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
    this.notificationUnlisten = await this.bleClient.onNotification((notification) => this.onNotification(notification));
  }

  async stopPersistentListener(): Promise<void> {
    if (!this.notificationUnlisten) return;
    this.notificationUnlisten();
    this.notificationUnlisten = null;
  }

  private onNotification(notification: BleNotification): void {
    if (notification.deviceId !== this.deviceId) return;
    if (notification.value.length === 0) return;

    const hex = bytesToHex(notification.value);
    const asciiRaw = String.fromCharCode(...notification.value);
    const printable = toPrintableAscii(asciiRaw);

    this.asciiBuffer += asciiRaw;
    this.hexBuffer += hex;
    otaLog(`RX ${notification.value.length}B ASCII="${printable.substring(0, 120)}" HEX="${hex.substring(0, 120)}"`);
  }

  async enableNotifications(targets: NotificationTarget[]): Promise<void> {
    let enabledCount = 0;

    for (const target of targets) {
      try {
        const enabledTarget = await this.startNotificationWithFallback(target.serviceUuid, target.charUuid);
        pushUniquePair(this.enabledNotifyTargets, enabledTarget);
        enabledCount += 1;
      } catch (err) {
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
          await this.bleClient.startNotify(this.deviceId, svc, ch);
          return { serviceUuid: svc, charUuid: ch };
        } catch (err) {
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
        await this.bleClient.stopNotify(this.deviceId, target.serviceUuid, target.charUuid);
      } catch (err) {
        otaWarn(`stopNotify failed for service="${target.serviceUuid}" char="${target.charUuid}"`, err);
      }
    }
  }

  async write(serviceUuid: string, charUuid: string, data: number[], preferNoResponse = false): Promise<void> {
    if (!preferNoResponse) {
      try {
        await this.bleClient.write(this.deviceId, serviceUuid, charUuid, data, this.getMaxWriteBytes());
        return;
      } catch (err) {
        otaWarn("write failed, trying writeWithoutResponse", err);
      }
    }

    await this.bleClient.writeWithoutResponse(this.deviceId, serviceUuid, charUuid, data, this.getMaxWriteBytes());
  }

  async waitFor(
    timeoutMs: number,
    matcher: (asciiUpper: string, hexUpper: string) => "match" | "password_error" | "continue",
    signal?: AbortSignal,
  ): Promise<WaitResponseResult> {
    throwIfAborted(signal);
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      throwIfAborted(signal);
      const asciiUpper = this.asciiBuffer.toUpperCase();
      const hexUpper = this.hexBuffer.toUpperCase();
      const state = matcher(asciiUpper, hexUpper);
      if (state === "match") {
        return { status: "match", ascii: this.asciiBuffer, hex: this.hexBuffer };
      }
      if (state === "password_error") {
        return { status: "password_error", ascii: this.asciiBuffer, hex: this.hexBuffer };
      }
      await abortableDelay(5, signal);
    }

    return { status: "timeout", ascii: this.asciiBuffer, hex: this.hexBuffer };
  }
}
