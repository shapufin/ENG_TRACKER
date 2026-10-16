import { describe, it, expect } from "vitest";
import { generatePassword } from "./generatePassword";

describe("generatePassword", () => {
  it("is 16 characters of letters and digits by default", () => {
    expect(generatePassword()).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it("always mixes upper, lower and a digit", () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/\d/);
    }
  });

  it("does not repeat", () => {
    expect(new Set(Array.from({ length: 50 }, () => generatePassword())).size).toBe(50);
  });
});
