import { describe, expect, it } from "vitest";
import { avatarSeed } from "./avatarSeed";

describe("avatarSeed", () => {
  it("is deterministic for the same name", () => {
    expect(avatarSeed("Alb TL")).toBe(avatarSeed("Alb TL"));
  });

  it("returns a non-negative integer", () => {
    expect(Number.isInteger(avatarSeed("Jane"))).toBe(true);
    expect(avatarSeed("Jane")).toBeGreaterThanOrEqual(0);
    expect(avatarSeed("")).toBe(0);
  });
});
