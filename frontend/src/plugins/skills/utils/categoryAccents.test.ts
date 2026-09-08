import { describe, expect, it } from "vitest";
import { avgTone, categoryAccent } from "./categoryAccents";

describe("categoryAccent", () => {
  it("is deterministic for the same name", () => {
    expect(categoryAccent("Backend Ecosystem")).toEqual(categoryAccent("Backend Ecosystem"));
  });

  it("returns one of the five accent families with paired light/dark text", () => {
    const names = ["Backend", "Infra", "Cloud", "Frontend", "Data", "Security"];
    for (const name of names) {
      const accent = categoryAccent(name);
      expect(accent.text).toMatch(/dark:text-/);
      expect(accent.bg).toMatch(/bg-\w+-500\/5$/);
      expect(accent.border).toMatch(/border-l-\w+-500\/30$/);
    }
  });

  it("distributes distinct names across families", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const families = new Set(names.map((n) => categoryAccent(n).text));
    expect(families.size).toBeGreaterThan(1);
  });
});

describe("avgTone", () => {
  it("buckets averages to the matching level tone", () => {
    expect(avgTone(1.2)).toContain("text-rose-700");
    expect(avgTone(2.8)).toContain("text-amber-700");
    expect(avgTone(4.1)).toContain("text-blue-700");
    expect(avgTone(4.9)).toContain("text-emerald-700");
  });

  it("clamps out-of-range values", () => {
    expect(avgTone(0)).toContain("text-rose-700");
    expect(avgTone(9)).toContain("text-emerald-700");
  });

  it("always carries a dark variant", () => {
    for (const avg of [1, 2, 3, 4, 5]) {
      expect(avgTone(avg)).toMatch(/dark:text-/);
    }
  });
});
