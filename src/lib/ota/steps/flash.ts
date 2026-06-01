import type { OtaBleSession } from "../ble-session";
import { throwIfAborted } from "../abort";
import { CMD_TIMEOUT_MS, FLASH_CHUNK_SIZE_CANDIDATES, FLASH_PROBE_TIMEOUT_MS, STABLE_FLASH_CHUNK_SIZE } from "../constants";
import { buildFlashCommand } from "../protocol";

type FlashStatus = {
  chunkSize: number;
  elapsedMs: number;
  percent: number;
  speedBytesPerSecond: number;
  written: number;
  total: number;
};

function shouldReportStatus(percent: number, lastReportedPercent: number): boolean {
  return percent >= 100 || percent - lastReportedPercent >= 10;
}

function formatAddress(value: number): string {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

function maxAttemptsForChunk(chunkSize: number): number {
  return chunkSize > STABLE_FLASH_CHUNK_SIZE ? 1 : 2;
}

function responseTimeoutForChunk(chunkSize: number): number {
  return chunkSize > STABLE_FLASH_CHUNK_SIZE ? FLASH_PROBE_TIMEOUT_MS : CMD_TIMEOUT_MS;
}

export async function flashFirmware(
  session: OtaBleSession,
  serviceUuid: string,
  writeCharUuid: string,
  activeUuid: string,
  baseAddress: number,
  fileData: number[],
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
  onStatus?: (status: FlashStatus) => void,
  onTrace?: (message: string) => void,
): Promise<void> {
  let flashAddress = baseAddress;
  let written = 0;
  let chunkSizeIndex = 0;
  let lastReportedPercent = 0;
  const total = fileData.length;
  const startedAt = Date.now();
  let lastTracedChunkSize = 0;

  while (written < total) {
    throwIfAborted(signal);
    const chunkSize =
      FLASH_CHUNK_SIZE_CANDIDATES[chunkSizeIndex] ??
      FLASH_CHUNK_SIZE_CANDIDATES[FLASH_CHUNK_SIZE_CANDIDATES.length - 1];
    const chunk = fileData.slice(written, written + chunkSize);
    if (chunk.length === 0) break;

    const command = buildFlashCommand(activeUuid, flashAddress, chunk);
    let chunkAccepted = false;
    let retryWithSmallerChunk = false;
    const maxAttempts = maxAttemptsForChunk(chunk.length);

    if (lastTracedChunkSize !== chunk.length) {
      lastTracedChunkSize = chunk.length;
      onTrace?.(
        `FLASH usando bloco ${chunk.length}B: comando AT+TX ${command.length}B, ${Math.ceil(command.length / session.getMaxWriteBytes())} fragments BLE`,
      );
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      throwIfAborted(signal);
      session.clearNotificationBuffer();
      const attemptStartedAt = Date.now();

      try {
        await session.write(serviceUuid, writeCharUuid, command, true);
      } catch (error) {
        if (chunkSizeIndex < FLASH_CHUNK_SIZE_CANDIDATES.length - 1) {
          const nextChunkSize = FLASH_CHUNK_SIZE_CANDIDATES[chunkSizeIndex + 1];
          onTrace?.(
            `FLASH write falhou em ${formatAddress(flashAddress)} com bloco ${chunk.length}B; reduzindo para ${nextChunkSize}B`,
          );
          chunkSizeIndex += 1;
          retryWithSmallerChunk = true;
          break;
        }

        throw error;
      }
      throwIfAborted(signal);

      const response = await session.waitFor(responseTimeoutForChunk(chunk.length), (asciiUpper, hexUpper) => {
        if (asciiUpper.includes(activeUuid.toUpperCase())) return "match";
        if (hexUpper.includes(activeUuid.toUpperCase())) return "match";
        if (asciiUpper.includes("PASSWORD ERROR") || asciiUpper.includes("PASSWORD INCORRECT")) return "password_error";
        return "continue";
      }, signal);

      if (response.status === "match") {
        chunkAccepted = true;
        onTrace?.(
          `FLASH ack ${formatAddress(flashAddress)} size=${chunk.length}B attempt=${attempt} em ${Date.now() - attemptStartedAt}ms`,
        );
        break;
      }
      if (response.status === "password_error") throw new Error("Device returned password error during flash.");
      if (chunkSizeIndex < FLASH_CHUNK_SIZE_CANDIDATES.length - 1 && attempt === maxAttempts) {
        const nextChunkSize = FLASH_CHUNK_SIZE_CANDIDATES[chunkSizeIndex + 1];
        onTrace?.(
          `FLASH sem ACK em ${formatAddress(flashAddress)} com bloco ${chunk.length}B; reduzindo para ${nextChunkSize}B`,
        );
        chunkSizeIndex += 1;
        retryWithSmallerChunk = true;
        break;
      }
      if (attempt === maxAttempts) throw new Error("Flash failed: no response from device.");
    }

    if (retryWithSmallerChunk) {
      continue;
    }

    if (!chunkAccepted) {
      continue;
    }

    flashAddress += chunk.length;
    written += chunk.length;
    throwIfAborted(signal);
    const percent = Number.parseFloat(((written * 100) / total).toFixed(2));
    onProgress?.(percent);

    if (onStatus && shouldReportStatus(percent, lastReportedPercent)) {
      lastReportedPercent = Math.floor(percent / 10) * 10;
      const elapsedMs = Math.max(1, Date.now() - startedAt);
      onStatus({
        chunkSize: chunk.length,
        elapsedMs,
        percent,
        speedBytesPerSecond: (written / elapsedMs) * 1000,
        written,
        total,
      });
    }
  }
}
