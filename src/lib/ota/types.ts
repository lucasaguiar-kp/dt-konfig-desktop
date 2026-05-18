import type { BleClient } from "../ble/types";

export interface OtaParams {
  bleClient: BleClient;
  imei: string;
  password: string;
  file: File;
  serviceUuid?: string;
  charUuid?: string;
  txCharUuid?: string;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  onStatus?: (status: string) => void;
}

export interface OtaUuids {
  serviceUuid: string;
  notifyCharUuid: string;
  writeCharUuid: string;
}

export interface BleUuidPair {
  serviceUuid: string;
  charUuid: string;
}

export interface NotificationTarget {
  serviceUuid: string;
  charUuid: string;
}

export interface WaitResponseResult {
  status: "match" | "password_error" | "timeout";
  ascii: string;
  hex: string;
}
