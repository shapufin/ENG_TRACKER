import { describe, it, expect } from "vitest";
import { SCORE_PARTS } from "./scoreParts";

describe("SCORE_PARTS", () => {
  it("weights add up to 100, as COMPONENT_WEIGHTS does on the server", () => {
    expect(SCORE_PARTS.reduce((sum, part) => sum + part.weight, 0)).toBe(100);
    expect(SCORE_PARTS.map((part) => part.weight)).toEqual([40, 20, 20, 20]);
  });
});
