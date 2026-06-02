import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { BleCharacteristic, BleClient, BleDevice, BleNotification } from "../lib/ble/types";
import { useCommandHistoryStore } from "../stores/command-history-store";
import { useUserCommandsStore } from "../stores/user-commands-store";
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
  beforeEach(() => {
    localStorage.clear();
    useUserCommandsStore.setState({
      deviceCommands: {},
      devicePinnedCommandIds: {},
      initializedDeviceIds: [],
      hasHydrated: true,
    });
    useCommandHistoryStore.setState({
      deviceCommandHistory: {},
    });
  });

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

  it("renders connection as an icon button and moves copy/clear into the overflow menu", async () => {
    const client = new PanelTestClient();

    render(<DeviceTerminalPanel device={device} bleClient={client} autoConnect />);

    await waitFor(() => expect(client.connectCalls).toEqual(["device-1"]));

    expect(screen.getByRole("button", { name: /status: conectado/i })).toBeInTheDocument();
    expect(screen.queryByText("connected")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiar terminal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpar terminal" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mais ações do terminal" }));

    const menu = screen.getByRole("menu", { name: "Ações do terminal" });
    expect(menu).toHaveTextContent("Copiar terminal");
    expect(menu).toHaveTextContent("Limpar terminal");
  });

  it("shows pinned commands above the terminal input instead of inside the commands modal", async () => {
    const client = new PanelTestClient();
    useUserCommandsStore.setState({
      deviceCommands: {
        "device-1": [
          { id: "password", command: "378d0c", description: "Senha", requiresValue: false },
          { id: "cfg", command: "AT+CFG", description: "Config", requiresValue: false },
        ],
      },
      devicePinnedCommandIds: {
        "device-1": ["password", "cfg"],
      },
      initializedDeviceIds: ["device-1"],
    });

    render(<DeviceTerminalPanel device={device} bleClient={client} autoConnect />);

    await waitFor(() => expect(client.connectCalls).toEqual(["device-1"]));

    const terminalQuickCommands = screen.getByLabelText("Comandos fixados no terminal");
    expect(terminalQuickCommands).toHaveTextContent("378d0c");
    expect(terminalQuickCommands).toHaveTextContent("AT+CFG");

    fireEvent.click(screen.getByRole("button", { name: "Comandos" }));

    expect(screen.queryByLabelText("Comandos fixados")).not.toBeInTheDocument();
  });

  it("toggles the value requirement when clicking Valor", async () => {
    const client = new PanelTestClient();

    render(<DeviceTerminalPanel device={device} bleClient={client} autoConnect />);

    await waitFor(() => expect(client.connectCalls).toEqual(["device-1"]));
    fireEvent.click(screen.getByRole("button", { name: "Comandos" }));

    const valueToggle = screen.getByRole("switch", { name: "Valor" });
    expect(valueToggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(valueToggle);

    expect(valueToggle).toHaveAttribute("aria-checked", "true");
  });

  it("recalls sent commands with arrow up and down in the terminal input", async () => {
    const client = new PanelTestClient();

    render(<DeviceTerminalPanel device={device} bleClient={client} autoConnect />);

    await waitFor(() => expect(client.connectCalls).toEqual(["device-1"]));

    const input = screen.getByLabelText("Entrada do terminal");
    const sendButton = screen.getByRole("button", { name: "Enviar" });

    fireEvent.change(input, { target: { value: "AT+CFG" } });
    fireEvent.click(sendButton);
    await waitFor(() => expect(input).toHaveValue(""));

    fireEvent.change(input, { target: { value: "AT+TDC=7200" } });
    fireEvent.click(sendButton);
    await waitFor(() => expect(input).toHaveValue(""));

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("AT+TDC=7200");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("AT+CFG");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveValue("AT+TDC=7200");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveValue("");
  });

  it("opens sent command history from the input prompt button", async () => {
    const client = new PanelTestClient();

    render(<DeviceTerminalPanel device={device} bleClient={client} autoConnect />);

    await waitFor(() => expect(client.connectCalls).toEqual(["device-1"]));

    const input = screen.getByLabelText("Entrada do terminal");
    const sendButton = screen.getByRole("button", { name: "Enviar" });

    fireEvent.change(input, { target: { value: "AT+CFG" } });
    fireEvent.click(sendButton);
    await waitFor(() => expect(input).toHaveValue(""));

    fireEvent.change(input, { target: { value: "AT+TDC=7200" } });
    fireEvent.click(sendButton);
    await waitFor(() => expect(input).toHaveValue(""));

    fireEvent.click(screen.getByRole("button", { name: "Historico de comandos enviados" }));

    const historyMenu = screen.getByRole("listbox", { name: "Historico de comandos enviados" });
    expect(historyMenu).toHaveTextContent("AT+TDC=7200");
    expect(historyMenu).toHaveTextContent("AT+CFG");

    fireEvent.click(screen.getByRole("option", { name: "AT+CFG" }));

    expect(input).toHaveValue("AT+CFG");
    expect(screen.queryByRole("listbox", { name: "Historico de comandos enviados" })).not.toBeInTheDocument();
  });

  it("keeps sent command history after remounting the terminal panel", async () => {
    const client = new PanelTestClient();
    const { unmount } = render(<DeviceTerminalPanel device={device} bleClient={client} autoConnect />);

    await waitFor(() => expect(client.connectCalls).toEqual(["device-1"]));

    const input = screen.getByLabelText("Entrada do terminal");
    const sendButton = screen.getByRole("button", { name: "Enviar" });

    fireEvent.change(input, { target: { value: "AT+CFG" } });
    fireEvent.click(sendButton);
    await waitFor(() => expect(input).toHaveValue(""));

    unmount();

    render(<DeviceTerminalPanel device={device} bleClient={new PanelTestClient()} autoConnect />);

    fireEvent.click(screen.getByRole("button", { name: "Historico de comandos enviados" }));

    expect(screen.getByRole("listbox", { name: "Historico de comandos enviados" })).toHaveTextContent(
      "AT+CFG",
    );
  });
});
