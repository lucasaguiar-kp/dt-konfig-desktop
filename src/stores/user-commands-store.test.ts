import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultUserCommands, type UserCommand } from "../lib/user-commands";
import { storage } from "../storage";
import { useUserCommandsStore } from "./user-commands-store";

type PersistedUserCommandsState = {
  deviceCommands?: Record<string, unknown>;
  devicePinnedCommandIds?: Record<string, unknown>;
  initializedDeviceIds?: unknown;
  hasHydrated?: unknown;
};

async function storePersistedUserCommandsState(state: PersistedUserCommandsState): Promise<void> {
  await storage.store(
    JSON.stringify({
      state,
      version: 0,
    }),
    "user-commands-store",
  );
}

describe("useUserCommandsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useUserCommandsStore.setState({
      deviceCommands: {},
      devicePinnedCommandIds: {},
      initializedDeviceIds: [],
      hasHydrated: false,
    });
  });

  it("seeds default commands for a device", () => {
    useUserCommandsStore.getState().ensureDeviceCommands("device-1", "DTN_NB");

    const commands = useUserCommandsStore.getState().getDeviceCommands("device-1");

    expect(commands.map((command) => command.command)).toEqual([
      "AT+CFG",
      "AT+GETSENSORVALUE=1",
      "AT+GETSENSORVALUE=0",
      "AT+QBAND=",
      "AT+SERVADDR=",
      "AT+CLIENT=",
      "AT+UNAME=",
      "AT+PWD=",
      "AT+PUBTOPIC=",
      "AT+SUBTOPIC=",
      "AT+TDC=",
      "AT+APN=",
      "AT+PRO=",
    ]);
    expect(commands.find((command) => command.command === "AT+TDC=")?.requiresValue).toBe(true);
    expect(commands.find((command) => command.command === "AT+GETSENSORVALUE=1")?.requiresValue).toBe(false);
    expect(commands.find((command) => command.command === "AT+QBAND=")?.requiresValue).toBe(true);
    expect(commands.find((command) => command.command === "ATZ")).toBeUndefined();
  });

  it("seeds LoRa defaults for LoRa devices", () => {
    useUserCommandsStore.getState().ensureDeviceCommands("device-1", "DTL_LORA");

    const commands = useUserCommandsStore.getState().getDeviceCommands("device-1");

    expect(commands.map((command) => command.command)).toEqual([
      "AT+CFG",
      "AT+GETSENSORVALUE=1",
      "AT+GETSENSORVALUE=0",
      "AT+TDC=",
      "ATZ",
    ]);
    expect(commands.find((command) => command.command === "ATZ")?.requiresValue).toBe(false);
  });

  it("adds, edits, removes, and pins commands only for the selected device", () => {
    useUserCommandsStore.getState().ensureDeviceCommands("device-1");
    useUserCommandsStore.getState().ensureDeviceCommands("device-2");
    const device2InitialCommands = useUserCommandsStore.getState().getDeviceCommands("device-2");

    useUserCommandsStore.getState().addCommand("device-1", {
      command: "AT+CUSTOM=",
      description: "Custom command",
      requiresValue: true,
    });

    const addedCommand = useUserCommandsStore
      .getState()
      .getDeviceCommands("device-1")
      .find((command) => command.command === "AT+CUSTOM=");

    expect(addedCommand).toBeDefined();
    expect(useUserCommandsStore.getState().getDeviceCommands("device-2")).toEqual(device2InitialCommands);

    useUserCommandsStore.getState().togglePinCommand("device-1", addedCommand!.id);
    expect(useUserCommandsStore.getState().isPinnedCommand("device-1", addedCommand!.id)).toBe(true);
    expect(useUserCommandsStore.getState().getPinnedCommands("device-2")).toEqual([]);

    useUserCommandsStore.getState().updateCommand("device-1", {
      ...addedCommand!,
      command: "AT+EDITED",
      description: "Edited command",
      requiresValue: false,
    });

    expect(
      useUserCommandsStore.getState().getDeviceCommands("device-1").find((command) => command.id === addedCommand!.id),
    ).toMatchObject({
      command: "AT+EDITED",
      description: "Edited command",
      requiresValue: false,
    });
    expect(useUserCommandsStore.getState().getDeviceCommands("device-2")).toEqual(device2InitialCommands);

    useUserCommandsStore.getState().removeCommand("device-1", addedCommand!.id);

    expect(useUserCommandsStore.getState().getDeviceCommands("device-1")).not.toContainEqual(
      expect.objectContaining({ id: addedCommand!.id }),
    );
    expect(useUserCommandsStore.getState().isPinnedCommand("device-1", addedCommand!.id)).toBe(false);
    expect(useUserCommandsStore.getState().getDeviceCommands("device-2")).toEqual(device2InitialCommands);
  });

  it("resets one device to defaults without changing another device", () => {
    useUserCommandsStore.getState().ensureDeviceCommands("device-1", "DTN_NB");
    useUserCommandsStore.getState().ensureDeviceCommands("device-2", "DTL_LORA");
    useUserCommandsStore.getState().addCommand("device-1", {
      command: "AT+CUSTOM",
      requiresValue: false,
    });
    const device2Commands = useUserCommandsStore.getState().getDeviceCommands("device-2");

    useUserCommandsStore.getState().resetToDefaults("device-1", "DTN_NB");

    expect(useUserCommandsStore.getState().getDeviceCommands("device-1")).toEqual(createDefaultUserCommands("DTN_NB"));
    expect(useUserCommandsStore.getState().getDeviceCommands("device-2")).toEqual(device2Commands);
  });

  it("updates old default commands while preserving custom commands", () => {
    useUserCommandsStore.setState({
      deviceCommands: {
        "device-1": [
          {
            id: "custom-command",
            command: "AT+CUSTOM",
            requiresValue: false,
          },
          {
            id: "default:AT+QCGDEFCONT=IPV4V6,",
            command: "AT+QCGDEFCONT=IPV4V6,",
            requiresValue: true,
          },
        ],
      },
      initializedDeviceIds: ["device-1"],
    });

    useUserCommandsStore.getState().ensureDeviceCommands("device-1", "DTN_NB");

    expect(useUserCommandsStore.getState().getDeviceCommands("device-1").map((command) => command.command)).toEqual([
      "AT+CUSTOM",
      ...createDefaultUserCommands("DTN_NB").map((command) => command.command),
    ]);
  });

  it("persists command data, pinned command ids, and initialized device ids only", async () => {
    useUserCommandsStore.getState().ensureDeviceCommands("device-1");
    const cfgCommand = useUserCommandsStore
      .getState()
      .getDeviceCommands("device-1")
      .find((command) => command.command === "AT+CFG");

    useUserCommandsStore.getState().togglePinCommand("device-1", cfgCommand!.id);
    useUserCommandsStore.getState().setHasHydrated(true);

    const persistedValue = await storage.show<string>("user-commands-store");
    const persisted = JSON.parse(persistedValue ?? "{}") as {
      state?: Record<string, unknown>;
    };

    expect(Object.keys(persisted.state ?? {}).sort()).toEqual([
      "deviceCommands",
      "devicePinnedCommandIds",
      "initializedDeviceIds",
    ]);
    expect(persisted.state?.deviceCommands).toEqual({
      "device-1": expect.arrayContaining([
        expect.objectContaining({
          command: "AT+CFG",
        }),
      ]),
    });
    expect(persisted.state?.devicePinnedCommandIds).toEqual({
      "device-1": [cfgCommand!.id],
    });
    expect(persisted.state?.initializedDeviceIds).toEqual(["device-1"]);
    expect(persisted.state).not.toHaveProperty("hasHydrated");
  });

  it("hydrates persisted command state and sets the hydration flag", async () => {
    const persistedCommand: UserCommand = {
      id: "custom-command",
      command: "AT+CUSTOM",
      description: "Persisted custom command",
      requiresValue: false,
    };

    await storePersistedUserCommandsState({
      deviceCommands: {
        "device-1": [persistedCommand],
      },
      devicePinnedCommandIds: {
        "device-1": ["custom-command"],
      },
      initializedDeviceIds: ["device-1"],
      hasHydrated: true,
    });

    await useUserCommandsStore.persist.rehydrate();

    expect(useUserCommandsStore.getState().hasHydrated).toBe(true);
    expect(useUserCommandsStore.getState().getDeviceCommands("device-1")).toEqual([persistedCommand]);
    expect(useUserCommandsStore.getState().getPinnedCommands("device-1")).toEqual([persistedCommand]);
    expect(useUserCommandsStore.getState().initializedDeviceIds).toEqual(["device-1"]);
  });

  it("sanitizes corrupted persisted commands during hydration", async () => {
    await storePersistedUserCommandsState({
      deviceCommands: {
        "device-1": [
          {
            id: "valid",
            command: " AT+VALID ",
            description: "Valid command",
            requiresValue: false,
          },
          {
            id: "missing-requires-value",
            command: "AT+INVALID",
          },
          {
            id: "blank-command",
            command: "   ",
            requiresValue: false,
          },
        ],
        "device-2": "not-an-array",
      },
      devicePinnedCommandIds: {
        "device-1": ["valid", 123],
        "device-2": [false],
      },
      initializedDeviceIds: ["device-1", 123],
    });

    await useUserCommandsStore.persist.rehydrate();

    expect(useUserCommandsStore.getState().deviceCommands).toEqual({
      "device-1": [
        {
          id: "valid",
          command: "AT+VALID",
          description: "Valid command",
          requiresValue: false,
        },
      ],
    });
    expect(useUserCommandsStore.getState().devicePinnedCommandIds).toEqual({
      "device-1": ["valid"],
    });
    expect(useUserCommandsStore.getState().initializedDeviceIds).toEqual(["device-1"]);
    expect(useUserCommandsStore.getState().hasHydrated).toBe(true);
  });

  it("can restore defaults when hydrated initialized device has invalid command data", async () => {
    await storePersistedUserCommandsState({
      deviceCommands: {
        "device-1": [
          {
            id: "invalid",
            command: "AT+INVALID",
          },
        ],
      },
      initializedDeviceIds: ["device-1"],
    });

    await useUserCommandsStore.persist.rehydrate();

    expect(useUserCommandsStore.getState().getDeviceCommands("device-1")).toEqual([]);

    useUserCommandsStore.getState().ensureDeviceCommands("device-1");

    expect(useUserCommandsStore.getState().getDeviceCommands("device-1")).toEqual(createDefaultUserCommands());
    expect(useUserCommandsStore.getState().initializedDeviceIds).toEqual(["device-1"]);
  });
});
