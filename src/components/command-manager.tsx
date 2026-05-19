import { Check, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { UserCommand } from "../lib/user-commands";
import { useUserCommandsStore } from "../stores/user-commands-store";

type CommandManagerProps = {
  deviceId: string | null;
  onInsertCommand: (command: string) => void;
  onSendCommand: (command: string) => void;
};

type CommandFormState = {
  command: string;
  description: string;
  requiresValue: boolean;
};

const EMPTY_FORM: CommandFormState = {
  command: "",
  description: "",
  requiresValue: false,
};

export function CommandManager({ deviceId, onInsertCommand, onSendCommand }: CommandManagerProps) {
  const ensureDeviceCommands = useUserCommandsStore((state) => state.ensureDeviceCommands);
  const commandsByDevice = useUserCommandsStore((state) => state.deviceCommands);
  const pinnedByDevice = useUserCommandsStore((state) => state.devicePinnedCommandIds);
  const addCommand = useUserCommandsStore((state) => state.addCommand);
  const updateCommand = useUserCommandsStore((state) => state.updateCommand);
  const removeCommand = useUserCommandsStore((state) => state.removeCommand);
  const togglePinCommand = useUserCommandsStore((state) => state.togglePinCommand);
  const [form, setForm] = useState<CommandFormState>(EMPTY_FORM);
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);

  useEffect(() => {
    if (deviceId) {
      ensureDeviceCommands(deviceId);
    }
  }, [deviceId, ensureDeviceCommands]);

  const commands = useMemo(() => (deviceId ? commandsByDevice[deviceId] ?? [] : []), [commandsByDevice, deviceId]);
  const pinnedCommandIds = useMemo(
    () => (deviceId ? pinnedByDevice[deviceId] ?? [] : []),
    [deviceId, pinnedByDevice],
  );

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingCommandId(null);
  }

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!deviceId || !form.command.trim()) {
      return;
    }

    const payload = {
      command: form.command.trim(),
      description: form.description.trim() || undefined,
      requiresValue: form.requiresValue,
    };

    if (editingCommandId) {
      updateCommand(deviceId, { id: editingCommandId, ...payload });
    } else {
      addCommand(deviceId, payload);
    }

    resetForm();
  }

  function startEditing(command: UserCommand) {
    setEditingCommandId(command.id);
    setForm({
      command: command.command,
      description: command.description ?? "",
      requiresValue: command.requiresValue,
    });
  }

  if (!deviceId) {
    return (
      <section className="command-manager empty-manager">
        <h3>Comandos</h3>
        <p>Selecione um dispositivo para gerenciar comandos salvos.</p>
      </section>
    );
  }

  return (
    <section className="command-manager">
      <form className="command-form" onSubmit={submitCommand}>
        <input
          value={form.command}
          onChange={(event) => setForm((value) => ({ ...value, command: event.target.value }))}
          placeholder="AT+COMANDO="
          aria-label="Comando"
        />
        <input
          value={form.description}
          onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
          placeholder="Descricao"
          aria-label="Descricao do comando"
        />
        <button
          type="button"
          className={`value-toggle ${form.requiresValue ? "active" : ""}`}
          role="switch"
          aria-checked={form.requiresValue}
          onClick={() => setForm((value) => ({ ...value, requiresValue: !value.requiresValue }))}
        >
          <span aria-hidden="true" />
          Valor
        </button>
        <button type="submit" className="icon-button primary" title={editingCommandId ? "Salvar" : "Criar"}>
          {editingCommandId ? <Check size={17} /> : <Plus size={17} />}
        </button>
        {editingCommandId ? (
          <button type="button" className="icon-button" onClick={resetForm} title="Cancelar edicao">
            <X size={17} />
          </button>
        ) : null}
      </form>

      <div className="command-list">
        {commands.map((command) => {
          const isPinned = pinnedCommandIds.includes(command.id);
          return (
            <div className="command-row" key={command.id}>
              <button
                type="button"
                className="command-run"
                onClick={() =>
                  command.requiresValue ? onInsertCommand(command.command) : onSendCommand(command.command)
                }
              >
                <strong>{command.command}</strong>
                <small>{command.description ?? (command.requiresValue ? "Requer valor" : "Enviar direto")}</small>
              </button>
              <button
                type="button"
                className={`icon-button compact ${isPinned ? "active" : ""}`}
                onClick={() => togglePinCommand(deviceId, command.id)}
                title={isPinned ? "Remover dos fixados" : "Fixar comando"}
              >
                <Pin size={15} />
              </button>
              <button type="button" className="icon-button compact" onClick={() => startEditing(command)} title="Editar">
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="icon-button compact danger"
                onClick={() => removeCommand(deviceId, command.id)}
                title="Excluir"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
