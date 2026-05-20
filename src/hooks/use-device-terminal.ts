import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tauriBleClient } from "../lib/ble/client";
import type { BleClient, BleNotification } from "../lib/ble/types";
import type { KhompDeviceType } from "../lib/constants";
import {
  buildDeviceCommandBytes,
  bytesToPrintableAscii,
  getDeviceCommandOptions,
  normalizeBleUuid,
  parseDeviceTerminalChunk,
  resolveDeviceTerminalCharacteristic,
} from "../lib/device-terminal";
import type { DeviceTerminalEvent, DeviceTerminalStage, TerminalCharacteristic } from "../lib/device-terminal";

type UseDeviceTerminalOptions = {
  client?: BleClient;
  deviceId: string | null;
  deviceType: KhompDeviceType | null;
  stopScan?: () => Promise<void>;
  resolveDeviceIdBeforeConnect?: () => Promise<string | null>;
};

export type TerminalConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type TerminalHistoryEntry = {
  id: string;
  direction: "rx" | "tx" | "system";
  text: string;
  timestamp: number;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Erro de comunicacao com o dispositivo.";
}

function normalizeTerminalText(value: string): string {
  return value.replace(/\.{3,}/g, "\n").replace(/\r\n?/g, "\n").trim();
}

function createHistoryEntry(direction: TerminalHistoryEntry["direction"], text: string): TerminalHistoryEntry {
  return {
    id: `${Date.now()}-${Math.random()}`,
    direction,
    text,
    timestamp: Date.now(),
  };
}

export function useDeviceTerminal({
  client = tauriBleClient,
  deviceId,
  deviceType,
  stopScan,
  resolveDeviceIdBeforeConnect,
}: UseDeviceTerminalOptions) {
  const [status, setStatus] = useState<TerminalConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TerminalHistoryEntry[]>([]);
  const [stage, setStage] = useState<DeviceTerminalStage>("password");
  const [configReady, setConfigReady] = useState(false);
  const [isBoxModel, setIsBoxModel] = useState(false);
  const terminalCharacteristicRef = useRef<TerminalCharacteristic | null>(null);
  const notificationUnsubscribeRef = useRef<(() => void) | null>(null);
  const ownedDeviceRef = useRef<{ deviceId: string; generation: number } | null>(null);
  const rxBufferRef = useRef("");
  const flushTimerRef = useRef<number | null>(null);
  const stageRef = useRef<DeviceTerminalStage>("password");
  const configRequestedRef = useRef(false);
  const isBoxModelRef = useRef(false);
  const connectionGenerationRef = useRef(0);
  const isMountedRef = useRef(false);

  const commandOptions = useMemo(
    () => getDeviceCommandOptions(deviceType, stage, isBoxModel),
    [deviceType, isBoxModel, stage],
  );

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const appendHistory = useCallback((direction: TerminalHistoryEntry["direction"], text: string) => {
    setHistory((entries) => [...entries, createHistoryEntry(direction, text)]);
  }, []);

  const isGenerationCurrent = useCallback(
    (generation: number) => isMountedRef.current && connectionGenerationRef.current === generation,
    [],
  );

  const cleanupConnection = useCallback(
    async (
      targetDeviceId: string | null,
      characteristic: TerminalCharacteristic | null,
      unsubscribe: (() => void) | null,
      options: { generation: number; clearCurrentState: boolean },
    ) => {
      if (options.clearCurrentState && isGenerationCurrent(options.generation)) {
        clearFlushTimer();
        rxBufferRef.current = "";
      }

      unsubscribe?.();

      if (
        targetDeviceId &&
        connectionGenerationRef.current !== options.generation &&
        ownedDeviceRef.current?.deviceId === targetDeviceId &&
        ownedDeviceRef.current.generation !== options.generation
      ) {
        return;
      }

      if (targetDeviceId && characteristic) {
        await client
          .stopNotify(targetDeviceId, characteristic.serviceUuid, characteristic.notifyCharUuid)
          .catch(() => undefined);
      }

      if (targetDeviceId) {
        await client.disconnect(targetDeviceId).catch(() => undefined);
      }
    },
    [clearFlushTimer, client, isGenerationCurrent],
  );

  const disconnect = useCallback(async () => {
    const disconnectGeneration = ++connectionGenerationRef.current;
    const currentDeviceId = ownedDeviceRef.current?.deviceId ?? deviceId;
    const currentCharacteristic = terminalCharacteristicRef.current;
    const unsubscribe = notificationUnsubscribeRef.current;
    notificationUnsubscribeRef.current = null;
    terminalCharacteristicRef.current = null;
    await cleanupConnection(currentDeviceId, currentCharacteristic, unsubscribe, {
      generation: disconnectGeneration,
      clearCurrentState: true,
    });

    if (isGenerationCurrent(disconnectGeneration)) {
      ownedDeviceRef.current = null;
      setStatus("disconnected");
    }
  }, [cleanupConnection, deviceId, isGenerationCurrent]);

  const flushRxBuffer = useCallback(() => {
    clearFlushTimer();
    const rawText = rxBufferRef.current;
    rxBufferRef.current = "";

    if (!rawText.trim()) {
      return;
    }

    const text = normalizeTerminalText(rawText);
    if (!text) {
      return;
    }

    appendHistory("rx", text);

    const terminalState: DeviceTerminalEvent = {
      deviceType,
      stage: stageRef.current,
      configRequested: configRequestedRef.current,
      isBoxModel: isBoxModelRef.current,
    };
    const parseResult = parseDeviceTerminalChunk(text, terminalState);

    stageRef.current = parseResult.nextStage;
    isBoxModelRef.current = parseResult.isBoxModel;
    setStage(parseResult.nextStage);
    setIsBoxModel(parseResult.isBoxModel);

    if (parseResult.configReady) {
      setConfigReady(true);
    }

    if (parseResult.shouldSendConfig) {
      configRequestedRef.current = true;
      void sendCommand("AT+CFG");
    }

    if (parseResult.shouldShowAtzNotice) {
      appendHistory("system", "Alteracao aplicada apos ATZ.");
    }

    if (parseResult.passwordRejected || parseResult.shouldDisconnect) {
      const message = parseResult.passwordRejected
        ? "Senha rejeitada pelo dispositivo."
        : "Tempo para senha expirado.";
      stageRef.current = "password";
      configRequestedRef.current = false;
      setStage("password");
      setConfigReady(false);
      setError(message);
      appendHistory("system", message);
    }
  }, [appendHistory, clearFlushTimer, deviceType]);

  const handleAscii = useCallback(
    (ascii: string) => {
      rxBufferRef.current += ascii;

      if (/\bok\b/i.test(rxBufferRef.current)) {
        flushRxBuffer();
        return;
      }

      clearFlushTimer();
      flushTimerRef.current = window.setTimeout(flushRxBuffer, 350);
    },
    [clearFlushTimer, flushRxBuffer],
  );

  const connect = useCallback(async () => {
    if (!deviceId) {
      return;
    }

    if (!ownedDeviceRef.current || ownedDeviceRef.current.deviceId === deviceId) {
      await disconnect();
    }

    const attemptId = ++connectionGenerationRef.current;
    const isCurrentAttempt = () => isMountedRef.current && connectionGenerationRef.current === attemptId;

    if (!isCurrentAttempt()) {
      return;
    }

    const connectionDeviceId = (await resolveDeviceIdBeforeConnect?.()) ?? deviceId;

    if (!connectionDeviceId || !isCurrentAttempt()) {
      return;
    }

    ownedDeviceRef.current = { deviceId: connectionDeviceId, generation: attemptId };
    setStatus("connecting");
    setError(null);
    setStage("password");
    setConfigReady(false);
    setIsBoxModel(false);
    stageRef.current = "password";
    configRequestedRef.current = false;
    isBoxModelRef.current = false;

    let attemptedCharacteristic: TerminalCharacteristic | null = null;
    let attemptedUnsubscribe: (() => void) | null = null;

    try {
      await stopScan?.();
      if (!isCurrentAttempt()) {
        await cleanupConnection(connectionDeviceId, null, null, { generation: attemptId, clearCurrentState: false });
        return;
      }

      await client.connect(connectionDeviceId);
      if (!isCurrentAttempt()) {
        await cleanupConnection(connectionDeviceId, null, null, { generation: attemptId, clearCurrentState: false });
        return;
      }

      const characteristics = await client.services(connectionDeviceId);
      if (!isCurrentAttempt()) {
        await cleanupConnection(connectionDeviceId, null, null, { generation: attemptId, clearCurrentState: false });
        return;
      }

      const terminalCharacteristic = resolveDeviceTerminalCharacteristic(characteristics);

      if (!terminalCharacteristic) {
        throw new Error("Caracteristica de terminal nao encontrada.");
      }

      attemptedCharacteristic = terminalCharacteristic;
      const unsubscribe = await client.onNotification((notification: BleNotification) => {
        if (!isCurrentAttempt()) {
          return;
        }

        if (String(notification.deviceId) !== String(connectionDeviceId)) {
          return;
        }

        if (
          normalizeBleUuid(notification.serviceUuid) !== terminalCharacteristic.serviceUuid ||
          normalizeBleUuid(notification.characteristicUuid) !== terminalCharacteristic.notifyCharUuid
        ) {
          return;
        }

        const ascii = bytesToPrintableAscii(notification.value);
        if (ascii) {
          handleAscii(ascii);
        }
      });
      attemptedUnsubscribe = unsubscribe;
      if (!isCurrentAttempt()) {
        unsubscribe();
        attemptedUnsubscribe = null;
        await cleanupConnection(connectionDeviceId, null, null, { generation: attemptId, clearCurrentState: false });
        return;
      }

      await client.startNotify(
        connectionDeviceId,
        terminalCharacteristic.serviceUuid,
        terminalCharacteristic.notifyCharUuid,
      );
      if (!isCurrentAttempt()) {
        await cleanupConnection(connectionDeviceId, terminalCharacteristic, unsubscribe, {
          generation: attemptId,
          clearCurrentState: false,
        });
        return;
      }

      terminalCharacteristicRef.current = terminalCharacteristic;
      notificationUnsubscribeRef.current = unsubscribe;
      setStatus("connected");
      appendHistory("system", "Conectado ao terminal BLE.");
    } catch (connectError) {
      if (!isCurrentAttempt()) {
        await cleanupConnection(deviceId, attemptedCharacteristic, attemptedUnsubscribe, {
          generation: attemptId,
          clearCurrentState: false,
        });
        return;
      }

      const message = getErrorMessage(connectError);
      await cleanupConnection(connectionDeviceId, attemptedCharacteristic, attemptedUnsubscribe, {
        generation: attemptId,
        clearCurrentState: true,
      });

      if (isCurrentAttempt()) {
        ownedDeviceRef.current = null;
        terminalCharacteristicRef.current = null;
        notificationUnsubscribeRef.current = null;
        setError(message);
        appendHistory("system", message);
        setStatus("error");
      }
    }
  }, [
    appendHistory,
    cleanupConnection,
    client,
    deviceId,
    disconnect,
    handleAscii,
    resolveDeviceIdBeforeConnect,
    stopScan,
  ]);

  const sendCommand = useCallback(
    async (command: string, value = "") => {
      const targetDeviceId = ownedDeviceRef.current?.deviceId ?? deviceId;

      if (!targetDeviceId || !terminalCharacteristicRef.current) {
        setError("Conecte ao dispositivo antes de enviar comandos.");
        return;
      }

      const bytes = buildDeviceCommandBytes(command, value, deviceType);
      if (bytes.length === 0) {
        return;
      }

      const displayCommand = normalizeTerminalText(`${command}${value}`);
      setError(null);
      appendHistory("tx", displayCommand);
      const characteristic = terminalCharacteristicRef.current;

      try {
        await client.write(
          targetDeviceId,
          characteristic.serviceUuid,
          characteristic.writeCharUuid,
          bytes,
          bytes.length,
        );
      } catch (writeError) {
        try {
          await client.writeWithoutResponse(
            targetDeviceId,
            characteristic.serviceUuid,
            characteristic.writeCharUuid,
            bytes,
            bytes.length,
          );
        } catch {
          const message = getErrorMessage(writeError);
          setError(message);
          appendHistory("system", message);
        }
      }
    },
    [appendHistory, client, deviceId, deviceType],
  );

  const copyTerminal = useCallback(async () => {
    const text = history.map((entry) => `[${entry.direction.toUpperCase()}] ${entry.text}`).join("\n");
    await navigator.clipboard?.writeText(text);
  }, [history]);

  const copyEntry = useCallback(async (entry: TerminalHistoryEntry) => {
    await navigator.clipboard?.writeText(entry.text);
  }, []);

  const clearTerminal = useCallback(() => {
    setHistory([]);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      connectionGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  return {
    status,
    error,
    history,
    stage,
    configReady,
    isBoxModel,
    commandOptions,
    connect,
    disconnect,
    sendCommand,
    copyTerminal,
    copyEntry,
    clearTerminal,
  };
}
