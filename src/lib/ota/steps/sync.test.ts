import { describe, expect, it, vi } from "vitest";
import type { OtaBleSession } from "../ble-session";
import { SYNC_MAX_RETRIES, SYNC_MAX_SILENT_ATTEMPTS } from "../constants";
import type { WaitResponseResult } from "../types";
import { runSyncHandshake } from "./sync";

function passwordError(): WaitResponseResult {
  return { status: "password_error", ascii: "[123]Password Incorrect", hex: "" };
}

function timeout(): WaitResponseResult {
  return { status: "timeout", ascii: "", hex: "" };
}

function match(uuid: string): WaitResponseResult {
  return { status: "match", ascii: uuid.toUpperCase(), hex: "" };
}

function makeSession(responses: WaitResponseResult[]) {
  let call = 0;
  const waitFor = vi.fn(async (): Promise<WaitResponseResult> => responses[Math.min(call++, responses.length - 1)]);
  const session = {
    clearNotificationBuffer: vi.fn(),
    write: vi.fn(async () => {}),
    waitFor,
  };
  return { session: session as unknown as OtaBleSession, waitFor };
}

describe("runSyncHandshake", () => {
  it("locks onto the factory EUI after the password attempt gets no response", async () => {
    // Rotation is [password, EUI]. The password attempt is not echoed back, then the factory EUI
    // is, and the handshake locks onto it — exactly the path the proven mobile app takes.
    const { session, waitFor } = makeSession([timeout(), match("6666666666666666")]);

    const activeUuid = await runSyncHandshake(session, "svc", "char", "378d0c");

    expect(activeUuid).toBe("6666666666666666");
    expect(waitFor).toHaveBeenCalledTimes(2);
  });

  it("retries through repeated Password Incorrect and fails only after the full budget", async () => {
    // "Password Incorrect" is not terminal — keep alternating UUIDs like the proven app does.
    const { session, waitFor } = makeSession([passwordError()]);

    await expect(runSyncHandshake(session, "svc", "char", "378d0c")).rejects.toThrow(/recusou/i);
    expect(waitFor).toHaveBeenCalledTimes(SYNC_MAX_RETRIES);
  });

  it("bails quickly when the device stays silent", async () => {
    const { session, waitFor } = makeSession([timeout()]);

    await expect(runSyncHandshake(session, "svc", "char", "378407")).rejects.toThrow(/não respondeu/i);
    expect(waitFor).toHaveBeenCalledTimes(SYNC_MAX_SILENT_ATTEMPTS);
  });
});
