import { describe, expect, it } from "vitest";
import { derivePasswordUuid } from "./protocol";

describe("derivePasswordUuid", () => {
  it("derives the first 8 UTF-8 password bytes as a padded hex UUID", () => {
    expect(derivePasswordUuid("123456")).toBe("3132333435360000");
    expect(derivePasswordUuid("  abcdefghijk  ")).toBe("6162636465666768");
  });
});
