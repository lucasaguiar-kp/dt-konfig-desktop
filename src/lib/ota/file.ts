import { utf8ToBytes } from "./bytes";
import { MAGIC_STRING, MAX_FILE_SIZE } from "./constants";

function includesSubarray(data: number[], needle: number[]): boolean {
  outer: for (let i = 0; i <= data.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (data[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export async function validateFirmwareFile(file: File): Promise<{ data: number[]; size: number }> {
  if (!file.name.toLowerCase().endsWith(".bin")) {
    throw new Error("Firmware file must use the .bin extension.");
  }

  if (file.size === 0) {
    throw new Error("Firmware file is empty.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Firmware file too large: ${file.size} bytes (max ${MAX_FILE_SIZE} bytes / 192 KB).`);
  }

  const data = Array.from(new Uint8Array(await file.arrayBuffer()));
  const size = data.length;

  if (size > MAX_FILE_SIZE) {
    throw new Error(`Firmware file too large: ${size} bytes (max ${MAX_FILE_SIZE} bytes / 192 KB).`);
  }

  if (!includesSubarray(data, utf8ToBytes(MAGIC_STRING))) {
    throw new Error(`Invalid firmware file: magic string "${MAGIC_STRING}" not found in file content.`);
  }

  return { data, size };
}
