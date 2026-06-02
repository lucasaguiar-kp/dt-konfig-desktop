import { Copy, PlugZap, Send, Settings, Terminal, Trash2, Unplug, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { getBleDeviceIdentity } from "../lib/ble/device-identity";
import type { BleClient, BleDevice } from "../lib/ble/types";
import { getKhompDeviceType, getKhompDeviceTypeLabel } from "../lib/constants";
import { useDeviceTerminal } from "../hooks/use-device-terminal";
import { useCommandHistoryStore } from "../stores/command-history-store";
import { useUserCommandsStore } from "../stores/user-commands-store";
import { CommandManager } from "./command-manager";

type DeviceTerminalPanelProps = {
  device: BleDevice | null;
  bleClient?: BleClient;
  stopScan?: () => Promise<void>;
  resolveDeviceIdBeforeConnect?: () => Promise<string | null>;
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

export function DeviceTerminalPanel({
  device,
  bleClient,
  stopScan,
  resolveDeviceIdBeforeConnect,
  autoConnect = false,
}: DeviceTerminalPanelProps) {
  const deviceType = device ? getKhompDeviceType(device.name ?? device.localName) : null;
  const deviceAutoConnectKey = device ? getBleDeviceIdentity(device) : null;
  const [inputValue, setInputValue] = useState("");
  const [sentCommandIndex, setSentCommandIndex] = useState<number | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCommandsOpen, setIsCommandsOpen] = useState(false);
  const lastAutoConnectDeviceIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const commandDraftRef = useRef("");
  const {
    status,
    error,
    history,
    stage,
    connect,
    disconnect,
    sendCommand,
    copyTerminal,
    copyEntry,
    clearTerminal,
  } = useDeviceTerminal({
    client: bleClient,
    deviceId: device?.id ?? null,
    deviceType,
    stopScan,
    resolveDeviceIdBeforeConnect,
  });
  const ensureDeviceCommands = useUserCommandsStore((state) => state.ensureDeviceCommands);
  const commandsByDevice = useUserCommandsStore((state) => state.deviceCommands);
  const pinnedByDevice = useUserCommandsStore((state) => state.devicePinnedCommandIds);
  const commandHistoryByDevice = useCommandHistoryStore((state) => state.deviceCommandHistory);
  const rememberCommand = useCommandHistoryStore((state) => state.rememberCommand);

  useEffect(() => {
    if (device) {
      ensureDeviceCommands(device.id, deviceType);
    }
  }, [device, deviceType, ensureDeviceCommands]);

  useEffect(() => {
    if (!device || !deviceAutoConnectKey) {
      lastAutoConnectDeviceIdRef.current = null;
      return;
    }

    if (!autoConnect || lastAutoConnectDeviceIdRef.current === deviceAutoConnectKey) {
      return;
    }

    lastAutoConnectDeviceIdRef.current = deviceAutoConnectKey;
    void connect();
  }, [autoConnect, connect, device, deviceAutoConnectKey]);

  const pinnedCommands = useMemo(() => {
    if (!device) {
      return [];
    }

    const commands = commandsByDevice[device.id] ?? [];
    const pinnedIds = pinnedByDevice[device.id] ?? [];
    return commands.filter((command) => pinnedIds.includes(command.id));
  }, [commandsByDevice, device, pinnedByDevice]);

  const sentCommands = useMemo(
    () => (device ? commandHistoryByDevice[device.id] ?? [] : []),
    [commandHistoryByDevice, device],
  );

  useEffect(() => {
    const historyElement = historyRef.current;
    if (!historyElement) {
      return;
    }

    historyElement.scrollTop = historyElement.scrollHeight;
  }, [history]);

  function insertCommand(command: string) {
    setSentCommandIndex(null);
    setIsHistoryOpen(false);
    commandDraftRef.current = "";
    setInputValue(command);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(command.length, command.length);
    });
  }

  function rememberSentCommand(command: string) {
    if (device) {
      rememberCommand(device.id, command);
    }

    setSentCommandIndex(null);
    setIsHistoryOpen(false);
    commandDraftRef.current = "";
  }

  async function sendAndRemember(command: string) {
    await sendCommand(command);
    rememberSentCommand(command);
  }

  async function sendInput(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const command = inputValue.trim();

    if (!command) {
      return;
    }

    await sendAndRemember(command);
    setInputValue("");
  }

  function handleInputChange(value: string) {
    setInputValue(value);
    setSentCommandIndex(null);
    setIsHistoryOpen(false);
    commandDraftRef.current = "";
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      if (!sentCommands.length) {
        return;
      }

      event.preventDefault();
      const nextIndex = sentCommandIndex === null ? sentCommands.length - 1 : Math.max(sentCommandIndex - 1, 0);

      if (sentCommandIndex === null) {
        commandDraftRef.current = inputValue;
      }

      setSentCommandIndex(nextIndex);
      setInputValue(sentCommands[nextIndex]);
      setIsHistoryOpen(false);
      return;
    }

    if (event.key === "ArrowDown" && sentCommandIndex !== null) {
      event.preventDefault();
      const nextIndex = sentCommandIndex + 1;

      if (nextIndex >= sentCommands.length) {
        setSentCommandIndex(null);
        setInputValue(commandDraftRef.current);
        commandDraftRef.current = "";
        setIsHistoryOpen(false);
        return;
      }

      setSentCommandIndex(nextIndex);
      setInputValue(sentCommands[nextIndex]);
      setIsHistoryOpen(false);
    }
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
        <div className="terminal-title">
          <Terminal size={14} />
          <span>Terminal</span>
          <span className="terminal-divider">·</span>
          <strong>{getDeviceName(device)}</strong>
          <small>{deviceType ? getKhompDeviceTypeLabel(deviceType) : "Khomp"}</small>
        </div>
        <div className="terminal-actions">
          <span className={`connection-badge connection-${status}`}>{status}</span>
          <button type="button" className="tiny-button" onClick={clearTerminal} title="Limpar terminal">
            <Trash2 size={13} />
            Limpar
          </button>
          <button type="button" className="icon-button" onClick={copyTerminal} title="Copiar terminal">
            <Copy size={18} />
          </button>
          <button type="button" className="tiny-button accent" onClick={() => setIsCommandsOpen(true)}>
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

      {error ? <p className="inline-error">{error}</p> : null}

      <div className="terminal-device-summary">
        <span>{device.id}</span>
      </div>

      <div ref={historyRef} className="terminal-history" aria-label="Historico do terminal">
        {history.length ? (
          history.map((entry) => (
            <div className={`terminal-entry terminal-entry-${entry.direction}`} key={entry.id}>
              <div className="entry-meta">
                <time>{formatTimestamp(entry.timestamp)}</time>
                <span>{entry.direction.toUpperCase()}</span>
              </div>
              <pre>{entry.text}</pre>
              <button type="button" className="entry-copy" onClick={() => void copyEntry(entry)} title="Copiar entrada">
                <Copy size={13} />
              </button>
            </div>
          ))
        ) : (
          <div className="terminal-placeholder">Conecte e envie comandos para iniciar a sessao.</div>
        )}
      </div>

      {pinnedCommands.length ? (
        <div className="terminal-pinned-commands" aria-label="Comandos fixados no terminal">
          <span>Fixados</span>
          {pinnedCommands.map((command) => (
            <button
              type="button"
              key={command.id}
              onClick={() =>
                command.requiresValue ? insertCommand(command.command) : void sendAndRemember(command.command)
              }
              disabled={status !== "connected"}
              title={command.description ?? command.command}
            >
              {command.command}
              {command.requiresValue ? <small>VAL</small> : null}
            </button>
          ))}
        </div>
      ) : null}

      <form className="terminal-input-row" onSubmit={(event) => void sendInput(event)}>
        <button
          type="button"
          className="input-prompt"
          aria-label="Historico de comandos enviados"
          aria-haspopup="listbox"
          aria-expanded={isHistoryOpen}
          onClick={() => setIsHistoryOpen((isOpen) => (sentCommands.length ? !isOpen : false))}
          disabled={!sentCommands.length}
          title="Historico de comandos enviados"
        >
          ›
        </button>
        {isHistoryOpen ? (
          <div className="command-history-menu" role="listbox" aria-label="Historico de comandos enviados">
            {[...sentCommands].reverse().map((command) => (
              <button
                type="button"
                key={command}
                role="option"
                aria-selected={inputValue === command}
                onClick={() => insertCommand(command)}
              >
                {command}
              </button>
            ))}
          </div>
        ) : null}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={stage === "password" ? "Digite a senha do dispositivo" : "Digite um comando AT"}
          aria-label="Entrada do terminal"
          spellCheck={false}
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

            <CommandManager
              deviceId={device.id}
              deviceType={deviceType}
              onInsertCommand={(command) => {
                insertCommand(command);
                setIsCommandsOpen(false);
              }}
              onSendCommand={(command) => {
                void sendAndRemember(command);
                setIsCommandsOpen(false);
              }}
            />
          </section>
        </div>
      ) : null}
    </section>
  );
}
