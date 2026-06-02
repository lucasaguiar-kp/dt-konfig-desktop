import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function fillIdentifyStep(container: HTMLElement) {
  const imeiInput = screen.getByLabelText("IMEI");
  const passwordInput = screen.getByLabelText("Senha OTA");
  const fileInput = container.querySelector('input[type="file"]');
  if (!(fileInput instanceof HTMLInputElement)) throw new Error("File input not found.");

  fireEvent.change(imeiInput, { target: { value: "8675309" } });
  fireEvent.change(passwordInput, { target: { value: "secret" } });
  fireEvent.change(fileInput, { target: { files: [firmwareFile("firmware.bin")] } });
}

function advanceToSendStep(container: HTMLElement) {
  fillIdentifyStep(container);
  fireEvent.click(screen.getByRole("button", { name: /próximo/i }));
  fireEvent.click(screen.getByRole("button", { name: /próximo/i }));
}

describe("OtaView", () => {
  let createdLogBlob: Blob | null = null;

  beforeEach(() => {
    createdLogBlob = null;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        createdLogBlob = blob;
        return "blob:ota-log";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    startDtnNbOtaMock.mockReset();
    startDtnNbOtaMock.mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the OTA password as plain text", () => {
    render(<OtaView />);

    expect(screen.getByLabelText("Senha OTA")).toHaveAttribute("type", "text");
  });

  it("keeps the next button disabled until the identification step is complete", () => {
    const { container } = render(<OtaView />);
    const fileInput = container.querySelector('input[type="file"]');
    if (!(fileInput instanceof HTMLInputElement)) throw new Error("File input not found.");

    expect(screen.getByRole("button", { name: /próximo/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("IMEI"), { target: { value: "8675309" } });
    fireEvent.change(screen.getByLabelText("Senha OTA"), { target: { value: "secret" } });
    expect(screen.getByRole("button", { name: /próximo/i })).toBeDisabled();

    fireEvent.change(fileInput, { target: { files: [firmwareFile("firmware.bin")] } });
    expect(screen.getByRole("button", { name: /próximo/i })).toBeEnabled();
  });

  it("walks through the physical steps and starts the OTA from the send step", async () => {
    const { container } = render(<OtaView />);
    fillIdentifyStep(container);

    fireEvent.click(screen.getByRole("button", { name: /próximo/i }));
    expect(screen.getByText("Clique 5 vezes no botão do dispositivo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /próximo/i }));
    expect(screen.getByText("Clique em Enviar e segure o botão")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    await waitFor(() => expect(startDtnNbOtaMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
  });

  it("shows OTA status, trace and progress messages in the console", async () => {
    startDtnNbOtaMock.mockImplementation(async ({ onStatus, onProgress, onTrace }) => {
      onStatus("Scanning for device by IMEI...");
      onTrace("TX writeWithoutResponse AT+TX FLASH, packet=217B, payload=200B, firmware=192B, encoded=446B, fragments=23x20B");
      onProgress(40);
      onProgress(50);
    });

    const { container } = render(<OtaView />);
    advanceToSendStep(container);
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    await waitFor(() => expect(screen.getAllByText("Scanning for device by IMEI...").length).toBeGreaterThan(0));
    expect(screen.getByText(/TX writeWithoutResponse AT\+TX FLASH/)).toBeInTheDocument();
    expect(screen.getByText("Progresso da atualização: 40%")).toBeInTheDocument();
    expect(screen.getByText("Progresso da atualização: 50%")).toBeInTheDocument();
    expect(screen.getAllByText("OTA concluído. O dispositivo foi reiniciado.").length).toBeGreaterThan(0);
  });

  it("downloads the full OTA log even when the visible console is truncated", async () => {
    startDtnNbOtaMock.mockImplementation(async ({ onTrace }) => {
      for (let index = 0; index < 605; index += 1) {
        onTrace(`trace-${index}`);
      }
    });

    const { container } = render(<OtaView />);
    advanceToSendStep(container);
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    await waitFor(() => expect(screen.getAllByText("OTA concluído. O dispositivo foi reiniciado.").length).toBeGreaterThan(0));
    expect(screen.queryByText("trace-0")).not.toBeInTheDocument();
    expect(screen.getByText("trace-604")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Baixar log completo"));

    expect(createdLogBlob).not.toBeNull();
    const text = await createdLogBlob!.text();
    expect(text).toContain("trace-0");
    expect(text).toContain("trace-604");
  });

  it("clears the form when starting a new OTA after success", async () => {
    startDtnNbOtaMock.mockResolvedValue(undefined);

    const { container } = render(<OtaView />);
    advanceToSendStep(container);
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /novo ota/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /novo ota/i }));

    expect(screen.getByLabelText("IMEI")).toHaveValue("");
    expect(screen.getByLabelText("Senha OTA")).toHaveValue("");
    expect(screen.getByText("Selecionar firmware .bin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /próximo/i })).toBeDisabled();
  });

  it("offers cancel and retry after a failure, and cancel resets everything to the start", async () => {
    startDtnNbOtaMock.mockImplementation(() => Promise.reject(new Error("Sync failed: password error.")));

    const { container } = render(<OtaView />);
    advanceToSendStep(container);
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getAllByText("Sync failed: password error.").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    // Back at the identification step with the form wiped clean.
    expect(screen.getByLabelText("IMEI")).toHaveValue("");
    expect(screen.getByLabelText("Senha OTA")).toHaveValue("");
    expect(screen.getByRole("button", { name: /próximo/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /tentar novamente/i })).not.toBeInTheDocument();
  });

  it("cancels a running OTA and offers to retry", async () => {
    const { container } = render(<OtaView />);
    advanceToSendStep(container);
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    await waitFor(() => expect(startDtnNbOtaMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(screen.getByText("OTA cancelado. Pronto para reenviar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
  });
});
