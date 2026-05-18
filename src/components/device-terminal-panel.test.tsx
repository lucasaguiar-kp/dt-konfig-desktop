import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BleCharacteristic, BleClient, BleDevice, BleNotification } from "../lib/ble/types";
import { DeviceTerminalPanel } from "./device-terminal-panel";

class PanelTestClient implements BleClient {
  connectCalls: string[] = [];
  stopScanCalls = 0;

  async startScan(): Promise<void> {}
  async stopScan(): Promise<void> {
    this.stopScanCalls += 1;
  }
  async connect(deviceId: string): Promise<void> {
    this.connectCalls.push(deviceId);
  }
  async disconnect(): Promise<void> {}
  async services(): Promise<BleCharacteristic[]> {
    return [
      {
        serviceUuid: "0000ffe0-0000-1000-8000-00805f9b34fb",
        characteristicUuid: "0000ffe1-0000-1000-8000-00805f9b34fb",
        properties: { notify: true, indicate: false, write: true, writeWithoutResponse: true },
      },
    ];
  }
  async startNotify(): Promise<void> {}
  async stopNotify(): Promise<void> {}
  async write(): Promise<void> {}
  async writeWithoutResponse(): Promise<void> {}
  async onDeviceDiscovered(): Promise<() => void> {
    return () => undefined;
  }
  async onNotification(_callback: (notification: BleNotification) => void): Promise<() => void> {
    return () => undefined;
  }
}

const device: BleDevice = {
  id: "device-1",
  name: "864370064386289",
  localName: "DTN NB",
  rssi: -55,
  lastSeenAt: Date.now(),
};

describe("DeviceTerminalPanel", () => {
  it("connects automatically when a device is selected with autoConnect enabled", async () => {
    const client = new PanelTestClient();

    render(<DeviceTerminalPanel device={device} bleClient={client} autoConnect />);

    await waitFor(() => expect(client.connectCalls).toEqual(["device-1"]));
  });

  it("does not render the password stage helper as a command button", async () => {
    const client = new PanelTestClient();

    render(<DeviceTerminalPanel device={device} bleClient={client} autoConnect />);

    await waitFor(() => expect(client.connectCalls).toEqual(["device-1"]));
    fireEvent.click(screen.getByRole("button", { name: "Comandos" }));

    expect(screen.queryByRole("button", { name: "Senha do dispositivo" })).not.toBeInTheDocument();
  });
});
