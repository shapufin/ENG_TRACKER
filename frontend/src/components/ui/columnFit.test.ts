import { describe, it, expect } from "vitest";
import { computeAutoVisibility } from "./columnFit";

const cols = [
  { id: "name", size: 200, priority: 1 as const },
  { id: "team", size: 150, priority: 2 as const },
  { id: "email", size: 150, priority: 3 as const },
  { id: "phone", size: 150, priority: 3 as const },
  { id: "notes", size: 150, priority: 2 as const },
];

describe("computeAutoVisibility", () => {
  it("returns all visible when width fits", () => {
    expect(computeAutoVisibility(cols, 800)).toEqual({
      name: true,
      team: true,
      email: true,
      phone: true,
      notes: true,
    });
  });

  it("hides priority 3 before priority 2", () => {
    // 800 total; 500 fits after dropping both priority-3 columns (300).
    const v = computeAutoVisibility(cols, 500);
    expect(v).toMatchObject({ email: false, phone: false, team: true, notes: true, name: true });
  });

  it("hides rightmost first within a priority", () => {
    // Dropping one priority-3 column (150) is enough: the rightmost one goes.
    expect(computeAutoVisibility(cols, 650)).toMatchObject({ phone: false, email: true });
    // Then priority 2, again right to left.
    expect(computeAutoVisibility(cols, 350)).toMatchObject({
      email: false,
      phone: false,
      notes: false,
      team: true,
    });
  });

  it("never hides priority 1 even when it cannot fit", () => {
    const v = computeAutoVisibility(cols, 50);
    expect(v.name).toBe(true);
    expect(v).toMatchObject({ team: false, email: false, phone: false, notes: false });
  });
});
