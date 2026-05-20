import { describe, expect, it } from "vitest";
import { getDeviceCommandOptions } from "./commands";

describe("getDeviceCommandOptions", () => {
  it("returns the DTN_NB command list", () => {
    expect(getDeviceCommandOptions("DTN_NB", "commands", false)).toEqual([
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
    ]);
  });

  it("returns the DTL_LORA command list", () => {
    expect(getDeviceCommandOptions("DTL_LORA", "commands", false)).toEqual([
      { command: "AT+CFG", label: "AT+CFG", requiresValue: false },
      { command: "AT+GETSENSORVALUE=1", label: "AT+GETSENSORVALUE=1", requiresValue: false },
      { command: "AT+GETSENSORVALUE=0", label: "AT+GETSENSORVALUE=0", requiresValue: false },
      { command: "AT+TDC=", label: "AT+TDC=", requiresValue: true },
      { command: "ATZ", label: "ATZ", requiresValue: false },
    ]);
  });
});
