import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "../storage";
import { useCommandHistoryStore } from "./command-history-store";

type PersistedCommandHistoryState = {
  deviceCommandHistory?: Record<string, unknown>;
};

async function storePersistedCommandHistoryState(state: PersistedCommandHistoryState): Promise<void> {
  await storage.store(
    JSON.stringify({
      state,
      version: 0,
    }),
    "command-history-store",
  );
}

describe("useCommandHistoryStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useCommandHistoryStore.setState({
      deviceCommandHistory: {},
    });
  });

  it("stores sent command history per device", () => {
    useCommandHistoryStore.getState().rememberCommand("device-1", "AT+CFG");
    useCommandHistoryStore.getState().rememberCommand("device-2", "AT+TDC=7200");

    expect(useCommandHistoryStore.getState().deviceCommandHistory).toEqual({
      "device-1": ["AT+CFG"],
      "device-2": ["AT+TDC=7200"],
    });
  });

  it("ignores blank commands, avoids adjacent duplicates, and keeps the latest 50 commands", () => {
    useCommandHistoryStore.getState().rememberCommand("device-1", "   ");
    useCommandHistoryStore.getState().rememberCommand("device-1", "AT+CFG");
    useCommandHistoryStore.getState().rememberCommand("device-1", "AT+CFG");

    for (let index = 0; index < 55; index += 1) {
      useCommandHistoryStore.getState().rememberCommand("device-1", `AT+CMD${index}`);
    }

    expect(useCommandHistoryStore.getState().deviceCommandHistory["device-1"]).toHaveLength(50);
    expect(useCommandHistoryStore.getState().deviceCommandHistory["device-1"][0]).toBe("AT+CMD5");
    expect(useCommandHistoryStore.getState().deviceCommandHistory["device-1"][49]).toBe("AT+CMD54");
  });

  it("persists command history", async () => {
    useCommandHistoryStore.getState().rememberCommand("device-1", "AT+CFG");

    const persistedValue = await storage.show<string>("command-history-store");
    const persisted = JSON.parse(persistedValue ?? "{}") as {
      state?: Record<string, unknown>;
    };

    expect(persisted.state).toEqual({
      deviceCommandHistory: {
        "device-1": ["AT+CFG"],
      },
    });
  });

  it("hydrates and sanitizes persisted command history", async () => {
    await storePersistedCommandHistoryState({
      deviceCommandHistory: {
        "device-1": [" AT+CFG ", "", 123, "AT+TDC=7200"],
        "device-2": "not-an-array",
      },
    });

    await useCommandHistoryStore.persist.rehydrate();

    expect(useCommandHistoryStore.getState().deviceCommandHistory).toEqual({
      "device-1": ["AT+CFG", "AT+TDC=7200"],
    });
  });
});
