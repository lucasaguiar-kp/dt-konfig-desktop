import { describe, expect, it } from "vitest";
import { buildDeviceCommandBytes, formatDeviceCommand } from "./protocol";

describe("device terminal protocol", () => {
  it("appends CRLF when building command bytes", () => {
    expect(buildDeviceCommandBytes("AT+CFG")).toEqual([65, 84, 43, 67, 70, 71, 13, 10]);
  });

  it("converts DTL_LORA TDC seconds to milliseconds", () => {
    expect(formatDeviceCommand("AT+TDC=", "15", "DTL_LORA")).toBe("AT+TDC=15000\r\n");
  });
});
