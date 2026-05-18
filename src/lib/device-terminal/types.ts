import type { KhompDeviceType } from "../constants";

export type DeviceTerminalStage = "password" | "config" | "commands";

export type DeviceCommandOption = {
  command: string;
  label: string;
  requiresValue: boolean;
};

export type TerminalCharacteristic = {
  serviceUuid: string;
  writeCharUuid: string;
  notifyCharUuid: string;
};

export type DeviceTerminalEvent = {
  deviceType: KhompDeviceType | null;
  stage: DeviceTerminalStage;
  configRequested: boolean;
  isBoxModel: boolean;
};

export type DeviceTerminalParseResult = {
  nextStage: DeviceTerminalStage;
  passwordAccepted: boolean;
  passwordRejected: boolean;
  shouldSendConfig: boolean;
  configReady: boolean;
  isBoxModel: boolean;
  shouldDisconnect: boolean;
  shouldShowAtzNotice: boolean;
};
