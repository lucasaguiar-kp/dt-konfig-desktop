import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdateButton } from "./app-update-button";

const updaterMocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: updaterMocks.check,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: updaterMocks.relaunch,
}));

describe("AppUpdateButton", () => {
  beforeEach(() => {
    updaterMocks.check.mockReset();
    updaterMocks.relaunch.mockReset();
  });

  it("does not render when there is no available update", async () => {
    updaterMocks.check.mockResolvedValue(null);

    render(<AppUpdateButton />);

    await waitFor(() => expect(updaterMocks.check).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /atualizar app/i })).not.toBeInTheDocument();
  });

  it("downloads, installs, and relaunches when an update is available", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    updaterMocks.check.mockResolvedValue({
      currentVersion: "0.1.5",
      version: "0.1.6",
      downloadAndInstall,
    });
    updaterMocks.relaunch.mockResolvedValue(undefined);

    render(<AppUpdateButton />);

    const updateButton = await screen.findByRole("button", { name: /atualizar app/i });
    fireEvent.click(updateButton);

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalledTimes(1));
    expect(updaterMocks.relaunch).toHaveBeenCalledTimes(1);
  });
});
