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
  it("packs widgets left to right at their default size and wraps rows", () => {
    const layout = presetLayout(["coverage-gaps", "people-mix", "period-close", "approval-queue"]);
    expect(layout.version).toBe(2);
    expect(layout.columns).toBe(12);
    expect(layout.widgets.map((w) => w.id)).toEqual([
      "coverage-gaps",
      "people-mix",
      "period-close",
      "approval-queue",
    ]);
    // 4 + 4 + 4 fills the first row; the 6-wide queue starts the next, below the tallest (5).
    expect(layout.widgets[2].position).toEqual({ x: 8, y: 0 });
    expect(layout.widgets[3].position).toEqual({ x: 0, y: 5 });
    expect(layout.widgets[3].size).toEqual({ w: 6, h: 5 });
  });

  it("falls back to a 4x4 cell for an unknown id", () => {
    expect(presetLayout(["mystery"]).widgets[0].size).toEqual({ w: 4, h: 4 });
  });

  it("every preset lays out without overlap or overflow", () => {
    for (const p of DASHBOARD_PRESETS) {
      const { widgets } = presetLayout(p.widgetIds);
      for (const w of widgets) expect(w.position.x + w.size.w).toBeLessThanOrEqual(12);
      for (const a of widgets) {
        for (const b of widgets) {
          if (a === b) continue;
          const apart =
            a.position.x + a.size.w <= b.position.x ||
            b.position.x + b.size.w <= a.position.x ||
            a.position.y + a.size.h <= b.position.y ||
            b.position.y + b.size.h <= a.position.y;
          expect(apart, `${p.id}: ${a.id} vs ${b.id}`).toBe(true);
        }
      }
    }
  });
});
