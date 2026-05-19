import type { DeviceTerminalEvent, DeviceTerminalParseResult } from "./types";

function includesAny(haystack: string, values: string[]): boolean {
  return values.some((value) => haystack.includes(value));
}

export function parseDeviceTerminalChunk(
  asciiChunk: string,
  state: DeviceTerminalEvent,
): DeviceTerminalParseResult {
  const upperChunk = asciiChunk.toUpperCase();
  const passwordAccepted = includesAny(upperChunk, ["PASSWORD CORRECT", "CORRECT PASSWORD"]);
  const passwordRejected = upperChunk.includes("PASSWORD INCORRECT");

  let nextStage = state.stage;
  let isBoxModel = state.isBoxModel;
  let shouldSendConfig = false;
  let configReady = false;

  if (passwordAccepted) {
    nextStage = "commands";
  }

  if (state.configRequested || shouldSendConfig) {
    if (state.deviceType === "DTN_NB" && upperChunk.includes("AT+MODEL=")) {
      isBoxModel = upperChunk.includes("BOX");
      nextStage = "commands";
      configReady = true;
    }

    if (state.deviceType === "DTL_LORA" && includesAny(upperChunk, ["AT+", "VERSION", "LORA"])) {
      nextStage = "commands";
      configReady = true;
    }
  }

  return {
    nextStage,
    passwordAccepted,
    passwordRejected,
    shouldSendConfig,
    configReady,
    isBoxModel,
    shouldDisconnect: upperChunk.includes("PASSWORD TIMEOUT"),
    shouldShowAtzNotice: upperChunk.includes("TAKE EFFECT AFTER ATZ"),
  };
}
