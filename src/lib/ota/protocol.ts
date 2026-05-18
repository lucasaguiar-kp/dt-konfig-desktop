import { bytesToHex, hexStringToBytes, packUint16LE, packUint32LE, utf8ToBytes } from "./bytes";
import {
  CMD_ERASE,
  CMD_FLASH,
  CMD_GET_VERSION,
  CMD_REBOOT,
  CMD_SYNC,
  DEV_EUI,
  LORA_BW,
  LORA_FREQ,
  LORA_SF,
  LORA_TX_POWER,
  PKT_END,
  PKT_START,
} from "./constants";

let crcTable: number[] | null = null;

function getCrcTable(): number[] {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
  });
  return crcTable;
}

export function derivePasswordUuid(password: string): string {
  const bytes = utf8ToBytes(password.trim());
  let hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  if (hex.length < 16) {
    hex = hex.padEnd(16, "0");
  }
  return hex;
}

function crc32(bytes: number[]): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildPacket(cmd: number, uuid: string, payload: number[]): number[] {
  const packetNoCrc = [PKT_START, cmd, ...hexStringToBytes(uuid), ...packUint16LE(payload.length), ...payload];
  const crc = crc32(packetNoCrc);
  return [...packetNoCrc, ...packUint32LE(crc), PKT_END];
}

export function wrapAtCommand(packet: number[], lineEnding = "\r\n"): number[] {
  const hex = bytesToHex(packet);
  const at = `AT+TX=${packet.length},${hex}${lineEnding}`;
  return utf8ToBytes(at);
}

export function buildSyncCommand(uuid: string, lineEnding = "\r\n"): number[] {
  const payload = [...hexStringToBytes(DEV_EUI), ...packUint32LE(LORA_FREQ), LORA_SF, LORA_BW, LORA_TX_POWER];
  const packet = buildPacket(CMD_SYNC, uuid, payload);
  return wrapAtCommand(packet, lineEnding);
}

export function buildGetVersionCommand(uuid: string, mode = 0): number[] {
  return wrapAtCommand(buildPacket(CMD_GET_VERSION, uuid, packUint32LE(mode)));
}

export function buildEraseCommand(uuid: string, address: number, size: number): number[] {
  const payload = [...packUint32LE(address), ...packUint32LE(size)];
  return wrapAtCommand(buildPacket(CMD_ERASE, uuid, payload));
}

export function buildFlashCommand(uuid: string, address: number, chunk: number[]): number[] {
  const payload = [...packUint32LE(address), ...packUint32LE(chunk.length), ...chunk];
  return wrapAtCommand(buildPacket(CMD_FLASH, uuid, payload));
}

export function buildRebootCommand(uuid: string, mode = 0): number[] {
  return wrapAtCommand(buildPacket(CMD_REBOOT, uuid, packUint32LE(mode)));
}
