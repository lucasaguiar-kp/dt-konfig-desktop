import { describe, expect, it, vi } from "vitest";
import { MockBleClient } from "./mock-client";

describe("MockBleClient", () => {
  it("emits discovered devices", async () => {
    const client = new MockBleClient();
    const callback = vi.fn();
    const unlisten = await client.onDeviceDiscovered(callback);
    client.emitDevice({ id: "1", name: "861", localName: "861", rssi: -55, lastSeenAt: 10 });
    expect(callback).toHaveBeenCalledWith({ id: "1", name: "861", localName: "861", rssi: -55, lastSeenAt: 10 });
    unlisten();
    client.emitDevice({ id: "2", name: "a84", localName: "a84", rssi: -65, lastSeenAt: 20 });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
