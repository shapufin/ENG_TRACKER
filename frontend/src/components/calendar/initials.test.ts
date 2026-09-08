import { describe, it, expect } from "vitest";
import { getInitials } from "./initials";

describe("getInitials", () => {
  it("returns -- for empty value", () => {
    expect(getInitials()).toBe("--");
    expect(getInitials("")).toBe("--");
    expect(getInitials("   ")).toBe("--");
  });

  it("returns first two letters for single word", () => {
    expect(getInitials("Alice")).toBe("AL");
  });

  it("returns first letters of first and last word", () => {
    expect(getInitials("Alice Smith")).toBe("AS");
    expect(getInitials("Alice  Smith  Johnson")).toBe("AJ");
  });
});
