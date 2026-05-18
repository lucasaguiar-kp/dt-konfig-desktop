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
});
