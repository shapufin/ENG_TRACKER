import { describe, it, expect } from "vitest";
import { AVAILABLE_WIDGETS } from "./dashboardWidgets";
import { defaultAdminLayout } from "@/components/dashboard/widgetRegistry";
import { DASHBOARD_PRESETS, presetLayout, resolvePresetWidgets } from "./dashboardPresets";

const available = AVAILABLE_WIDGETS.map((w) => ({ id: w.id, superuserOnly: w.superuserOnly }));

describe("DASHBOARD_PRESETS", () => {
  it("only references real widget ids", () => {
    const ids = new Set(AVAILABLE_WIDGETS.map((w) => w.id));
    for (const p of DASHBOARD_PRESETS) {
      for (const id of p.widgetIds) expect(ids.has(id), `${p.id}:${id}`).toBe(true);
    }
  });

  it("has unique preset ids and no duplicate widgets inside a preset", () => {
    expect(new Set(DASHBOARD_PRESETS.map((p) => p.id)).size).toBe(DASHBOARD_PRESETS.length);
    for (const p of DASHBOARD_PRESETS) expect(new Set(p.widgetIds).size).toBe(p.widgetIds.length);
  });

  it("the default preset mirrors the default layout", () => {
    const def = DASHBOARD_PRESETS.find((p) => p.id === "default")!;
    expect(def.widgetIds).toEqual(defaultAdminLayout.widgets.map((w) => w.id));
  });
});

describe("resolvePresetWidgets", () => {
  const preset = { id: "x", label: "x", description: "x", widgetIds: ["b", "a", "ghost", "su"] };
  const avail = [{ id: "a" }, { id: "b" }, { id: "su", superuserOnly: true }];

  it("keeps order and drops unknown ids", () => {
    expect(resolvePresetWidgets(preset, avail, true)).toEqual(["b", "a", "su"]);
  });

  it("drops superuser-only widgets for everyone else", () => {
    expect(resolvePresetWidgets(preset, avail, false)).toEqual(["b", "a"]);
  });

  it("works against the real widget list", () => {
    const approver = DASHBOARD_PRESETS.find((p) => p.id === "approver")!;
    expect(resolvePresetWidgets(approver, available, false)).toEqual(approver.widgetIds);
  });
});

describe("presetLayout", () => {
  it("lays widgets out in a 4-column grid in order", () => {
    const layout = presetLayout(["a", "b", "c", "d", "e"]);
    expect(layout.columns).toBe(4);
    expect(layout.widgets.map((w) => w.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(layout.widgets[4].position).toEqual({ x: 0, y: 1 });
    expect(layout.widgets[1].size).toEqual({ w: 1, h: 1 });
  });
});
