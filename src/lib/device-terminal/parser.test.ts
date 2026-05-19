import { describe, expect, it } from "vitest";
import { parseDeviceTerminalChunk } from "./parser";
import type { DeviceTerminalEvent } from "./types";

describe("parseDeviceTerminalChunk", () => {
  it("accepts password without requesting config automatically", () => {
    const state: DeviceTerminalEvent = {
      deviceType: "DTN_NB",
      stage: "password",
      configRequested: false,
      isBoxModel: false,
    };

    expect(parseDeviceTerminalChunk("PASSWORD CORRECT", state)).toMatchObject({
      nextStage: "commands",
      passwordAccepted: true,
      shouldSendConfig: false,
    });
  });

  it("marks DTN_NB config ready when requested config includes model", () => {
    const state: DeviceTerminalEvent = {
      deviceType: "DTN_NB",
      stage: "config",
      configRequested: true,
      isBoxModel: false,
    };

    expect(parseDeviceTerminalChunk("AT+MODEL=DTN NB BOX", state)).toMatchObject({
      nextStage: "commands",
      configReady: true,
      isBoxModel: true,
    });
  });
});
