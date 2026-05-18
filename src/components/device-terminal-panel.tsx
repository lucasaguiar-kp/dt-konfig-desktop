import { Copy, PlugZap, Send, Settings, Terminal, Unplug, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { BleClient, BleDevice } from "../lib/ble/types";
import { getKhompDeviceType, getKhompDeviceTypeLabel } from "../lib/constants";
import { useDeviceTerminal } from "../hooks/use-device-terminal";
import { useUserCommandsStore } from "../stores/user-commands-store";
import { CommandManager } from "./command-manager";

type DeviceTerminalPanelProps = {
  device: BleDevice | null;
  bleClient?: BleClient;
  stopScan?: () => Promise<void>;
  autoConnect?: boolean;
};

function getDeviceName(device: BleDevice): string {
  return device.name ?? device.localName ?? "Dispositivo sem nome";
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function DeviceTerminalPanel({ device, bleClient, stopScan, autoConnect = false }: DeviceTerminalPanelProps) {
  const deviceType = device ? getKhompDeviceType(device.name ?? device.localName) : null;
  const [inputValue, setInputValue] = useState("");
  const [isCommandsOpen, setIsCommandsOpen] = useState(false);
  const lastAutoConnectDeviceIdRef = useRef<string | null>(null);
  const {
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
  } = useDeviceTerminal({
    client: bleClient,
    deviceId: device?.id ?? null,
    deviceType,
    stopScan,
  });
  const ensureDeviceCommands = useUserCommandsStore((state) => state.ensureDeviceCommands);
  const commandsByDevice = useUserCommandsStore((state) => state.deviceCommands);
  const pinnedByDevice = useUserCommandsStore((state) => state.devicePinnedCommandIds);

  useEffect(() => {
    if (device) {
      ensureDeviceCommands(device.id);
    }
  }, [device, ensureDeviceCommands]);

  useEffect(() => {
    if (!device) {
      lastAutoConnectDeviceIdRef.current = null;
      return;
    }

    if (!autoConnect || lastAutoConnectDeviceIdRef.current === device.id) {
      return;
    }

    lastAutoConnectDeviceIdRef.current = device.id;
    void connect();
  }, [autoConnect, connect, device]);

  const pinnedCommands = useMemo(() => {
    if (!device) {
      return [];
    }

    const commands = commandsByDevice[device.id] ?? [];
    const pinnedIds = pinnedByDevice[device.id] ?? [];
    return commands.filter((command) => pinnedIds.includes(command.id));
  }, [commandsByDevice, device, pinnedByDevice]);

  function insertCommand(command: string) {
    setInputValue(command);
  }

  async function sendInput(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const command = inputValue.trim();

    if (!command) {
      return;
    }

    await sendCommand(command);
    setInputValue("");
  }

  if (!device) {
    return (
      <section className="terminal-panel terminal-empty">
        <Terminal size={34} />
        <h2>Nenhum dispositivo selecionado</h2>
        <p>Escolha um dispositivo compativel na lista para abrir o terminal BLE.</p>
      </section>
    );
  }

  return (
    <section className="terminal-panel">
      <header className="terminal-header">
        <div>
          <p className="eyebrow">{deviceType ? getKhompDeviceTypeLabel(deviceType) : "Khomp"}</p>
          <h2>{getDeviceName(device)}</h2>
          <p className="device-id">{device.id}</p>
        </div>
        <div className="terminal-actions">
          <span className={`connection-badge connection-${status}`}>{status}</span>
          <button type="button" className="icon-button" onClick={copyTerminal} title="Copiar terminal">
            <Copy size={18} />
          </button>
          <button type="button" className="control-button" onClick={() => setIsCommandsOpen(true)}>
            <Settings size={17} />
            Comandos
          </button>
          {status === "connected" ? (
            <button type="button" className="icon-button" onClick={() => void disconnect()} title="Desconectar">
              <Unplug size={18} />
            </button>
          ) : (
            <button type="button" className="control-button primary" onClick={() => void connect()}>
              <PlugZap size={17} />
              Conectar
            </button>
          )}
        </div>
      </header>

      <div className="terminal-state-row">
        <span>Etapa: {stage}</span>
        <span>{configReady ? "Config pronta" : "Aguardando config"}</span>
        {isBoxModel ? <span>BOX</span> : null}
      </div>

      {error ? <p className="inline-error">{error}</p> : null}

      <div className="terminal-history" aria-label="Historico do terminal">
        {history.length ? (
          history.map((entry) => (
            <div className={`terminal-entry terminal-entry-${entry.direction}`} key={entry.id}>
              <div className="entry-meta">
                <span>{entry.direction.toUpperCase()}</span>
                <time>{formatTimestamp(entry.timestamp)}</time>
                <button type="button" onClick={() => void copyEntry(entry)} title="Copiar entrada">
                  <Copy size={14} />
                </button>
              </div>
              <pre>{entry.text}</pre>
            </div>
          ))
        ) : (
          <div className="terminal-placeholder">Conecte e envie comandos para iniciar a sessao.</div>
        )}
      </div>

      <form className="terminal-input-row" onSubmit={(event) => void sendInput(event)}>
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder={stage === "password" ? "Senha do dispositivo" : "AT+COMANDO"}
          aria-label="Entrada do terminal"
        />
        <button type="submit" className="control-button primary" disabled={status !== "connected"}>
          <Send size={17} />
          Enviar
        </button>
      </form>

      {isCommandsOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsCommandsOpen(false)}>
          <section
            className="command-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Comandos do dispositivo"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Terminal BLE</p>
                <h3>Comandos</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setIsCommandsOpen(false)} title="Fechar">
                <X size={18} />
              </button>
            </div>

            <div className="terminal-command-strip">
              <div className="quick-command-bar" aria-label="Comandos fixados">
                {pinnedCommands.length ? (
                  pinnedCommands.map((command) => (
                    <button
                      type="button"
                      key={command.id}
                      onClick={() =>
                        command.requiresValue ? insertCommand(command.command) : void sendCommand(command.command)
                      }
                    >
                      {command.command}
                    </button>
                  ))
                ) : (
                  <span>Nenhum comando fixado</span>
                )}
              </div>

              <div className="quick-command-bar secondary" aria-label="Comandos da etapa">
                {commandOptions.map((option) => (
                  <button
                    type="button"
                    key={`${option.command}-${option.label}`}
                    onClick={() => (option.requiresValue ? insertCommand(option.command) : void sendCommand(option.command))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <CommandManager
              deviceId={device.id}
              onInsertCommand={(command) => {
                insertCommand(command);
                setIsCommandsOpen(false);
              }}
              onSendCommand={(command) => {
                void sendCommand(command);
                setIsCommandsOpen(false);
              }}
            />
          </section>
        </div>
      ) : null}
    </section>
  );
}
