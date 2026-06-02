import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BleDevice } from "../lib/ble/types";
import { DeviceSidebar } from "./device-sidebar";

function createDevice(overrides: Partial<BleDevice>): BleDevice {
  return {
    id: "device-id",
    name: "861275072547918",
    localName: null,
    rssi: -55,
    lastSeenAt: 1_000,
    ...overrides,
  };
}

describe("DeviceSidebar", () => {
  it("keeps devices in discovery order instead of sorting by latest scan update", () => {
    const { container } = render(
      <DeviceSidebar
        devices={[
          createDevice({ id: "first-device", name: "861275072547918", lastSeenAt: 1_000 }),
          createDevice({ id: "second-device", name: "a84041c000000001", lastSeenAt: 5_000 }),
        ]}
        selectedDeviceKey={null}
        scanStatus="idle"
        scanRemainingSeconds={0}
        scanError={null}
        onRefresh={() => undefined}
        onStartScan={() => undefined}
        onSelectDevice={() => undefined}
      />,
    );

    const deviceNames = Array.from(container.querySelectorAll(".device-row strong")).map(
      (element) => element.textContent,
    );

    expect(deviceNames).toEqual(["861275072547918", "a84041c000000001"]);
  });
});
