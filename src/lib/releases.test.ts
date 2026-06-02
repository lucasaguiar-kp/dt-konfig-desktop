import { describe, expect, it } from "vitest";
import { isVersionNewer } from "./releases";

describe("release version comparison", () => {
  it("detects newer GitHub release tags", () => {
    expect(isVersionNewer("v0.1.4", "0.1.2")).toBe(true);
    expect(isVersionNewer("0.2.0", "0.1.9")).toBe(true);
  });

  it("ignores equal, older, and invalid versions", () => {
    expect(isVersionNewer("v0.1.2", "0.1.2")).toBe(false);
    expect(isVersionNewer("v0.1.1", "0.1.2")).toBe(false);
    expect(isVersionNewer("release", "0.1.2")).toBe(false);
  });
});
