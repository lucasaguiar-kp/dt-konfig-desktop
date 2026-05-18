import { beforeEach, describe, expect, it } from "vitest";
import { Storage } from "./storage";

describe("Storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and reads JSON values under the app prefix", async () => {
    const storage = new Storage();
    await storage.store({ pinned: ["abc"] }, "devices");
    await expect(storage.show<{ pinned: string[] }>("devices")).resolves.toEqual({
      pinned: ["abc"],
    });
  });

  it("removes stored values", async () => {
    const storage = new Storage();
    await storage.store("value", "key");
    await storage.destroy("key");
    await expect(storage.show("key")).resolves.toBeNull();
  });
});
