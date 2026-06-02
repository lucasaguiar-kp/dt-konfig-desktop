import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { storage } from "../storage";

const COMMAND_HISTORY_LIMIT = 50;

type CommandHistoryStore = {
  deviceCommandHistory: Record<string, string[]>;
  rememberCommand: (deviceId: string, command: string) => void;
  clearDeviceHistory: (deviceId: string) => void;
};

function sanitizeCommandHistory(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([deviceId, commands]) => {
      if (!Array.isArray(commands)) {
        return [];
      }

      const sanitizedCommands = commands
        .filter((command): command is string => typeof command === "string")
        .map((command) => command.trim())
        .filter((command) => command.length > 0)
        .slice(-COMMAND_HISTORY_LIMIT);

      return sanitizedCommands.length > 0 ? [[deviceId, sanitizedCommands]] : [];
    }),
  );
}

export const useCommandHistoryStore = create<CommandHistoryStore>()(
  devtools(
    persist(
      (set) => ({
        deviceCommandHistory: {},

        rememberCommand: (deviceId, command) => {
          const sanitizedCommand = command.trim();

          if (!sanitizedCommand) {
            return;
          }

          set((state) => {
            const currentCommands = state.deviceCommandHistory[deviceId] ?? [];
            const nextCommands =
              currentCommands[currentCommands.length - 1] === sanitizedCommand
                ? currentCommands
                : [...currentCommands, sanitizedCommand];

            return {
              deviceCommandHistory: {
                ...state.deviceCommandHistory,
                [deviceId]: nextCommands.slice(-COMMAND_HISTORY_LIMIT),
              },
            };
          });
        },

        clearDeviceHistory: (deviceId) => {
          set((state) => {
            const deviceCommandHistory = { ...state.deviceCommandHistory };
            delete deviceCommandHistory[deviceId];
            return { deviceCommandHistory };
          });
        },
      }),
      {
        name: "command-history-store",
        storage: createJSONStorage(() => ({
          getItem: (name) => storage.show<string>(name),
          setItem: (name, value) => storage.store(value, name),
          removeItem: (name) => storage.destroy(name),
        })),
        partialize: (state) => ({
          deviceCommandHistory: state.deviceCommandHistory,
        }),
        merge: (persistedState, currentState) => {
          const persisted =
            persistedState && typeof persistedState === "object" ? (persistedState as Record<string, unknown>) : {};

          return {
            ...currentState,
            deviceCommandHistory: sanitizeCommandHistory(persisted.deviceCommandHistory),
          };
        },
      },
    ),
  ),
);

export type { CommandHistoryStore };
