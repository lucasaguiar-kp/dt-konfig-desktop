import { describe, expect, it } from "vitest";
import { getKhompDeviceType } from "./constants";

describe("getKhompDeviceType", () => {
  it("detects DTN NB devices by IMEI-like names", () => {
    expect(getKhompDeviceType("861275079782583")).toBe("DTN_NB");
  });

  it("detects DTL LoRa devices by a84 prefix", () => {
    expect(getKhompDeviceType("a84f-test")).toBe("DTL_LORA");
  });

  it("ignores unsupported names", () => {
    expect(getKhompDeviceType("random")).toBeNull();
    expect(getKhompDeviceType(undefined)).toBeNull();
  });
});
