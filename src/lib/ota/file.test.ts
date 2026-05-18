import { describe, expect, it, vi } from "vitest";
import { MAGIC_STRING, MAX_FILE_SIZE } from "./constants";
import { validateFirmwareFile } from "./file";

function firmwareFile(name: string, content: string): File {
  return new File([content], name, { type: "application/octet-stream" });
}

describe("validateFirmwareFile", () => {
  it("rejects files without a .bin extension", async () => {
    await expect(validateFirmwareFile(firmwareFile("firmware.txt", MAGIC_STRING))).rejects.toThrow(/\.bin/i);
  });

  it("rejects .bin files larger than 192 KB", async () => {
    const oversized = new File([new Uint8Array(MAX_FILE_SIZE + 1)], "firmware.bin", {
      type: "application/octet-stream",
    });

    await expect(validateFirmwareFile(oversized)).rejects.toThrow(/too large/i);
  });

  it("rejects oversized files before reading file contents", async () => {
    const oversized = {
      name: "firmware.bin",
      size: MAX_FILE_SIZE + 1,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(0)),
    } as unknown as File;

    await expect(validateFirmwareFile(oversized)).rejects.toThrow(/too large/i);
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects .bin files missing the OTA magic string", async () => {
    await expect(validateFirmwareFile(firmwareFile("firmware.bin", "not-a-dragino-firmware"))).rejects.toThrow(
      /magic string/i,
    );
  });

  it("accepts a .bin file containing the OTA magic string", async () => {
    const file = firmwareFile("firmware.bin", `header-${MAGIC_STRING}-payload`);

    await expect(validateFirmwareFile(file)).resolves.toEqual({
      data: Array.from(new TextEncoder().encode(`header-${MAGIC_STRING}-payload`)),
      size: 31,
    });
  });
});
