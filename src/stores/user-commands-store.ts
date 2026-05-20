import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import type { KhompDeviceType } from "../lib/constants";
import { createDefaultUserCommands, type UserCommand } from "../lib/user-commands";
import { storage } from "../storage";

type UserCommandsStore = {
  deviceCommands: Record<string, UserCommand[]>;
  devicePinnedCommandIds: Record<string, string[]>;
  initializedDeviceIds: string[];
  hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;
  ensureDeviceCommands: (deviceId: string, deviceType?: KhompDeviceType | null) => void;
  getDeviceCommands: (deviceId: string) => UserCommand[];
  getPinnedCommands: (deviceId: string) => UserCommand[];
  isPinnedCommand: (deviceId: string, commandId: string) => boolean;
  togglePinCommand: (deviceId: string, commandId: string) => void;
  addCommand: (deviceId: string, command: Omit<UserCommand, "id">) => void;
  updateCommand: (deviceId: string, command: UserCommand) => void;
  removeCommand: (deviceId: string, commandId: string) => void;
  resetToDefaults: (deviceId: string, deviceType?: KhompDeviceType | null) => void;
};

function sanitizeCommands(value: unknown): UserCommand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      "command" in item &&
      "requiresValue" in item &&
      typeof item.id === "string" &&
      typeof item.command === "string" &&
      typeof item.requiresValue === "boolean"
    ) {
      const command = item.command.trim();

      if (command.length === 0) {
        return [];
      }

      return [
        {
          id: item.id,
          command,
          description:
            "description" in item && typeof item.description === "string" ? item.description : undefined,
          requiresValue: item.requiresValue,
        },
      ];
    }

    return [];
  });
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sanitizePinnedCommandIds(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([deviceId, pinnedIds]) => [deviceId, sanitizeStringArray(pinnedIds)] as const)
      .filter(([, pinnedIds]) => pinnedIds.length > 0),
  );
}

function isDefaultCommand(command: UserCommand): boolean {
  return command.id.startsWith("default:");
}

function mergeCommandsWithDefaults(currentCommands: UserCommand[], defaultCommands: UserCommand[]): UserCommand[] {
  if (!currentCommands.length) {
    return defaultCommands;
  }

  const customCommands = currentCommands.filter((command) => !isDefaultCommand(command));
  const currentDefaultCommands = currentCommands.filter(isDefaultCommand);
  const currentDefaultIds = currentDefaultCommands.map((command) => command.id).join("|");
  const nextDefaultIds = defaultCommands.map((command) => command.id).join("|");

  if (currentDefaultCommands.length > 0 && currentDefaultIds === nextDefaultIds) {
    return currentCommands;
  }

  return [...customCommands, ...defaultCommands];
}

export const useUserCommandsStore = create<UserCommandsStore>()(
  devtools(
    persist(
      (set, get) => ({
        deviceCommands: {},
        devicePinnedCommandIds: {},
        initializedDeviceIds: [],
        hasHydrated: false,

        setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

        ensureDeviceCommands: (deviceId, deviceType) => {
          const defaultCommands = createDefaultUserCommands(deviceType);

          set((state) => ({
            initializedDeviceIds: state.initializedDeviceIds.includes(deviceId)
              ? state.initializedDeviceIds
              : [...state.initializedDeviceIds, deviceId],
            deviceCommands: {
              ...state.deviceCommands,
              [deviceId]: mergeCommandsWithDefaults(state.deviceCommands[deviceId] ?? [], defaultCommands),
            },
          }));
        },

        getDeviceCommands: (deviceId) => get().deviceCommands[deviceId] ?? [],

        getPinnedCommands: (deviceId) => {
          const commands = get().deviceCommands[deviceId] ?? [];
          const pinnedIds = get().devicePinnedCommandIds[deviceId] ?? [];
          return commands.filter((command) => pinnedIds.includes(command.id));
        },

        isPinnedCommand: (deviceId, commandId) =>
          (get().devicePinnedCommandIds[deviceId] ?? []).includes(commandId),

        togglePinCommand: (deviceId, commandId) => {
          set((state) => {
            const pinnedIds = state.devicePinnedCommandIds[deviceId] ?? [];
            const isPinned = pinnedIds.includes(commandId);

            return {
              devicePinnedCommandIds: {
                ...state.devicePinnedCommandIds,
                [deviceId]: isPinned ? pinnedIds.filter((id) => id !== commandId) : [...pinnedIds, commandId],
              },
            };
          });
        },

        addCommand: (deviceId, command) => {
          set((state) => ({
            deviceCommands: {
              ...state.deviceCommands,
              [deviceId]: [
                {
                  id: `${Date.now()}-${Math.random()}`,
                  command: command.command.trim(),
                  description: command.description,
                  requiresValue: command.requiresValue,
                },
                ...(state.deviceCommands[deviceId] ?? []),
              ],
            },
          }));
        },

        updateCommand: (deviceId, command) => {
          set((state) => ({
            deviceCommands: {
              ...state.deviceCommands,
              [deviceId]: (state.deviceCommands[deviceId] ?? []).map((item) =>
                item.id === command.id
                  ? {
                      ...item,
                      command: command.command.trim(),
                      description: command.description,
                      requiresValue: command.requiresValue,
                    }
                  : item,
              ),
            },
          }));
        },

        removeCommand: (deviceId, commandId) => {
          set((state) => ({
            deviceCommands: {
              ...state.deviceCommands,
              [deviceId]: (state.deviceCommands[deviceId] ?? []).filter((item) => item.id !== commandId),
            },
            devicePinnedCommandIds: {
              ...state.devicePinnedCommandIds,
              [deviceId]: (state.devicePinnedCommandIds[deviceId] ?? []).filter((id) => id !== commandId),
            },
          }));
        },

        resetToDefaults: (deviceId, deviceType) => {
          set((state) => ({
            deviceCommands: {
              ...state.deviceCommands,
              [deviceId]: createDefaultUserCommands(deviceType),
            },
            devicePinnedCommandIds: {
              ...state.devicePinnedCommandIds,
              [deviceId]: [],
            },
          }));
        },
      }),
      {
        name: "user-commands-store",
        storage: createJSONStorage(() => ({
          getItem: (name) => storage.show<string>(name),
          setItem: (name, value) => storage.store(value, name),
          removeItem: (name) => storage.destroy(name),
        })),
        partialize: (state) => ({
          deviceCommands: state.deviceCommands,
          devicePinnedCommandIds: state.devicePinnedCommandIds,
          initializedDeviceIds: state.initializedDeviceIds,
        }),
        merge: (persistedState, currentState) => {
          const persisted =
            persistedState && typeof persistedState === "object" ? (persistedState as Record<string, unknown>) : {};
          const rawDeviceCommands =
            persisted.deviceCommands && typeof persisted.deviceCommands === "object"
              ? (persisted.deviceCommands as Record<string, unknown>)
              : {};
          const deviceCommands: Record<string, UserCommand[]> = {};

          for (const [deviceId, commands] of Object.entries(rawDeviceCommands)) {
            const sanitizedCommands = sanitizeCommands(commands);

            if (sanitizedCommands.length > 0) {
              deviceCommands[deviceId] = sanitizedCommands;
            }
          }

          return {
            ...currentState,
            deviceCommands,
            devicePinnedCommandIds: sanitizePinnedCommandIds(persisted.devicePinnedCommandIds),
            initializedDeviceIds: sanitizeStringArray(persisted.initializedDeviceIds),
          };
        },
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      },
    ),
  ),
);

export type { UserCommandsStore };
