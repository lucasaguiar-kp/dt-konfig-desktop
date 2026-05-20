import type { KhompDeviceType } from "../constants";
import type { DeviceCommandOption, DeviceTerminalStage } from "./types";

const PASSWORD_COMMAND: DeviceCommandOption = {
  command: "",
  label: "Senha do dispositivo",
  requiresValue: true,
};

const NB_COMMANDS: DeviceCommandOption[] = [
  { command: "AT+CFG", label: "AT+CFG", requiresValue: false },
  { command: "AT+GETSENSORVALUE=1", label: "AT+GETSENSORVALUE=1", requiresValue: false },
  { command: "AT+GETSENSORVALUE=0", label: "AT+GETSENSORVALUE=0", requiresValue: false },
  { command: "AT+QBAND=", label: "AT+QBAND=", requiresValue: true },
  { command: "AT+SERVADDR=", label: "AT+SERVADDR=", requiresValue: true },
  { command: "AT+CLIENT=", label: "AT+CLIENT=", requiresValue: true },
  { command: "AT+UNAME=", label: "AT+UNAME=", requiresValue: true },
  { command: "AT+PWD=", label: "AT+PWD=", requiresValue: true },
  { command: "AT+PUBTOPIC=", label: "AT+PUBTOPIC=", requiresValue: true },
  { command: "AT+SUBTOPIC=", label: "AT+SUBTOPIC=", requiresValue: true },
  { command: "AT+TDC=", label: "AT+TDC=", requiresValue: true },
  { command: "AT+APN=", label: "AT+APN=", requiresValue: true },
  { command: "AT+PRO=", label: "AT+PRO=", requiresValue: true },
];

const NB_BOX_COMMANDS: DeviceCommandOption[] = [
  ...NB_COMMANDS,
];

const LORA_COMMANDS: DeviceCommandOption[] = [
  { command: "AT+CFG", label: "AT+CFG", requiresValue: false },
  { command: "AT+GETSENSORVALUE=1", label: "AT+GETSENSORVALUE=1", requiresValue: false },
  { command: "AT+GETSENSORVALUE=0", label: "AT+GETSENSORVALUE=0", requiresValue: false },
  { command: "AT+TDC=", label: "AT+TDC=", requiresValue: true },
  { command: "ATZ", label: "ATZ", requiresValue: false },
];

export function getDeviceCommandOptions(
  deviceType: KhompDeviceType | null,
  stage: DeviceTerminalStage,
  isBoxModel = false,
): DeviceCommandOption[] {
  if (stage === "password") {
    return [PASSWORD_COMMAND];
  }

  if (stage === "config") {
    return [];
  }

  if (deviceType === "DTN_NB") {
    return isBoxModel ? NB_BOX_COMMANDS : NB_COMMANDS;
  }

  if (deviceType === "DTL_LORA") {
    return LORA_COMMANDS;
  }

  return [];
}
