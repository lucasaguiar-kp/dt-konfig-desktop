import { describe, expect, it, vi } from "vitest";
import type { OtaBleSession } from "../ble-session";
import {
  CHUNK_SIZE,
  FALLBACK_FLASH_CHUNK_SIZE,
  FLASH_BASE_ADDR,
  FLASH_CHUNK_SIZE_CANDIDATES,
  FLASH_PROBE_TIMEOUT_MS,
  STABLE_FLASH_CHUNK_SIZE,
} from "../constants";
import { flashFirmware } from "./flash";

class FlashSession {
  writes: number[][] = [];
  clearNotificationBuffer = vi.fn();
  write = vi.fn(async (_serviceUuid: string, _charUuid: string, data: number[], _preferNoResponse?: boolean) => {
    this.writes.push(data);
    this.abortController.abort();
  });
  getMaxWriteBytes = vi.fn(() => 20);
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

  it("prefers writeWithoutResponse during flash writes", async () => {
    const controller = new AbortController();
    const session = new FlashSession(controller);
    const fileData = new Array(CHUNK_SIZE).fill(0x42);

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

    expect(session.write).toHaveBeenCalledWith(
      "0000ffe0-0000-1000-8000-00805f9b34fb",
      "0000ffe1-0000-1000-8000-00805f9b34fb",
      expect.any(Array),
      true,
    );
  });

  it("falls back from the optimized probe chunk after one timeout", async () => {
    const controller = new AbortController();
    const waitFor = vi
      .fn()
      .mockResolvedValueOnce({ status: "timeout" as const, ascii: "", hex: "" })
      .mockResolvedValue({ status: "match" as const, ascii: "6666666666666666", hex: "" });
    const write = vi.fn(async (_serviceUuid: string, _charUuid: string, _data: number[], _preferNoResponse?: boolean) => {});
    const session = {
      clearNotificationBuffer: vi.fn(),
      getMaxWriteBytes: vi.fn(() => 20),
      write,
      waitFor,
    };
    const fileData = new Array(CHUNK_SIZE).fill(0x42);

    await flashFirmware(
      session as unknown as OtaBleSession,
      "0000ffe0-0000-1000-8000-00805f9b34fb",
      "0000ffe1-0000-1000-8000-00805f9b34fb",
      "6666666666666666",
      FLASH_BASE_ADDR,
      fileData,
      undefined,
      controller.signal,
    );

    expect(session.write).toHaveBeenCalledTimes(3);
    const optimizedWrite = session.write.mock.calls[0][2] as number[];
    const fallbackWrite = session.write.mock.calls[1][2] as number[];
    expect(optimizedWrite.length).toBeGreaterThan(fallbackWrite.length);
    expect(fileData.length).toBe(CHUNK_SIZE);
    expect(FALLBACK_FLASH_CHUNK_SIZE).toBeLessThan(CHUNK_SIZE);
    expect(waitFor).toHaveBeenNthCalledWith(1, FLASH_PROBE_TIMEOUT_MS, expect.any(Function), controller.signal);
    expect(FLASH_CHUNK_SIZE_CANDIDATES[0]).toBeGreaterThan(STABLE_FLASH_CHUNK_SIZE);
  });
});
