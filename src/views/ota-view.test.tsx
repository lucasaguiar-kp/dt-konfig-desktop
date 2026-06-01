import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OtaView } from "./ota-view";

vi.mock("../lib/ble/client", () => ({
  tauriBleClient: {},
}));

const startDtnNbOtaMock = vi.fn();

vi.mock("../lib/ota/flow", () => ({
  startDtnNbOta: (...args: unknown[]) => startDtnNbOtaMock(...args),
}));

function firmwareFile(name: string): File {
  return new File(["dragino_6601_ota"], name, { type: "application/octet-stream" });
}

describe("OtaView", () => {
  beforeEach(() => {
    startDtnNbOtaMock.mockReset();
    startDtnNbOtaMock.mockImplementation(() => new Promise(() => {}));
  });

  it("keeps mutable inputs locked and cancel visible while OTA is running", async () => {
    const { container } = render(<OtaView />);
    const imeiInput = screen.getByLabelText("IMEI");
    const passwordInput = screen.getByLabelText("Senha OTA");
    const fileInput = container.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) throw new Error("File input not found.");

    fireEvent.change(imeiInput, { target: { value: "8675309" } });
    fireEvent.change(passwordInput, { target: { value: "secret" } });
    fireEvent.change(fileInput, { target: { files: [firmwareFile("firmware.bin")] } });
    fireEvent.click(screen.getByRole("button", { name: /iniciar ota/i }));

    await waitFor(() => expect(startDtnNbOtaMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();

    fireEvent.change(fileInput, { target: { files: [firmwareFile("other.bin")] } });

    expect(imeiInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
    expect(fileInput).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar ota/i })).toBeDisabled();
  });

  it("shows the OTA password as plain text", () => {
    render(<OtaView />);

    expect(screen.getByLabelText("Senha OTA")).toHaveAttribute("type", "text");
  });

  it("cancels and resets OTA state while keeping selected inputs", async () => {
    const { container } = render(<OtaView />);
    const imeiInput = screen.getByLabelText("IMEI");
    const passwordInput = screen.getByLabelText("Senha OTA");
    const fileInput = container.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) throw new Error("File input not found.");

    fireEvent.change(imeiInput, { target: { value: "8675309" } });
    fireEvent.change(passwordInput, { target: { value: "secret" } });
    fireEvent.change(fileInput, { target: { files: [firmwareFile("firmware.bin")] } });
    fireEvent.click(screen.getByRole("button", { name: /iniciar ota/i }));

    await waitFor(() => expect(startDtnNbOtaMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(imeiInput).toHaveValue("8675309");
    expect(passwordInput).toHaveValue("secret");
    expect(screen.getByText("firmware.bin")).toBeInTheDocument();
    expect(screen.getByText("OTA cancelado. Pronto para iniciar novamente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar ota/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it("shows OTA status and progress messages in the console", async () => {
    startDtnNbOtaMock.mockImplementation(async ({ onStatus, onProgress, onTrace }) => {
      onStatus("Scanning for device by IMEI...");
      onTrace("TX writeWithoutResponse AT+TX FLASH, packet=217B, payload=200B, firmware=192B, encoded=446B, fragments=23x20B");
      onProgress(40);
      onProgress(50);
    });

    const { container } = render(<OtaView />);
    const imeiInput = screen.getByLabelText("IMEI");
    const passwordInput = screen.getByLabelText("Senha OTA");
    const fileInput = container.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) throw new Error("File input not found.");

    fireEvent.change(imeiInput, { target: { value: "8675309" } });
    fireEvent.change(passwordInput, { target: { value: "secret" } });
    fireEvent.change(fileInput, { target: { files: [firmwareFile("firmware.bin")] } });
    fireEvent.click(screen.getByRole("button", { name: /iniciar ota/i }));

    await waitFor(() => expect(screen.getAllByText("Scanning for device by IMEI...").length).toBeGreaterThan(0));
    expect(screen.getByText(/TX writeWithoutResponse AT\+TX FLASH/)).toBeInTheDocument();
    expect(screen.getByText("Progresso da atualizacao: 40%")).toBeInTheDocument();
    expect(screen.getByText("Progresso da atualizacao: 50%")).toBeInTheDocument();
    expect(screen.getAllByText("OTA concluido. O dispositivo foi reiniciado.").length).toBeGreaterThan(0);
  });
});
