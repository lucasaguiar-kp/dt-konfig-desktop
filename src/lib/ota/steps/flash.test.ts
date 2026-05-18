import { describe, expect, it, vi } from "vitest";
import type { OtaBleSession } from "../ble-session";
import { CHUNK_SIZE, FLASH_BASE_ADDR } from "../constants";
import { flashFirmware } from "./flash";

class FlashSession {
  writes: number[][] = [];
  clearNotificationBuffer = vi.fn();
  write = vi.fn(async (_serviceUuid: string, _charUuid: string, data: number[]) => {
    this.writes.push(data);
    this.abortController.abort();
  });
  waitFor = vi.fn(async () => ({ status: "match" as const, ascii: "6666666666666666", hex: "" }));

  constructor(private readonly abortController: AbortController) {}
}

describe("flashFirmware", () => {
  it("stops writing chunks when cancelled after the first write", async () => {
    const controller = new AbortController();
    const session = new FlashSession(controller);
    const fileData = new Array(CHUNK_SIZE * 2).fill(0x42);

    await expect(
      flashFirmware(
        session as unknown as OtaBleSession,
        "0000ffe0-0000-1000-8000-00805f9b34fb",
        "0000ffe1-0000-1000-8000-00805f9b34fb",
        "6666666666666666",
        FLASH_BASE_ADDR,
        fileData,
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow(/cancel/i);

    expect(session.writes).toHaveLength(1);
  });
});
