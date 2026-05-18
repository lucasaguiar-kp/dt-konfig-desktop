import { describe, expect, it } from "vitest";
import { getDeviceCommandOptions } from "./commands";

describe("getDeviceCommandOptions", () => {
  it("includes QCGDEFCONT as a value-required DTN_NB command", () => {
    expect(getDeviceCommandOptions("DTN_NB", "commands", false)).toContainEqual({
      command: "AT+QCGDEFCONT=IPV4V6,",
      label: "AT+QCGDEFCONT=IPV4V6,",
      requiresValue: true,
    });
  });
});
