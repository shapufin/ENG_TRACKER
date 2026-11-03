import { describe, expect, it } from "vitest";
import { buildWorkspaceLayers } from "./buildWorkspaceLayers";
import type { CalendarWorkspace } from "@/types";

const ws = (over: Partial<CalendarWorkspace>) =>
  ({
    id: 1,
    name: "W",
    code: "w",
    team_name: undefined,
    team_code: undefined,
    ...over,
  }) as CalendarWorkspace;

describe("buildWorkspaceLayers", () => {
  it("keeps labels untouched when they are unique", () => {
    const layers = buildWorkspaceLayers([ws({ id: 1, name: "A", code: "a" })], new Map(), [1]);
    expect(layers).toEqual([{ id: 1, name: "A", code: "a", count: undefined, active: true }]);
  });

  it("disambiguates two distinct workspaces that share a team label", () => {
    const layers = buildWorkspaceLayers(
      [
        ws({ id: 1, name: "E2E Test Team", code: "e2e", team_name: "E2E Test Team" }),
        ws({ id: 2, name: "E2E Test Team B", code: "e2eb", team_name: "E2E Test Team" }),
      ],
      new Map(),
      []
    );
    expect(layers.map((l) => l.name)).toEqual([
      "E2E Test Team (e2e)",
      "E2E Test Team (E2E Test Team B)",
    ]);
    expect(new Set(layers.map((l) => l.name)).size).toBe(2);
  });
});
