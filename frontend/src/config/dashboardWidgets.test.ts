import { describe, it, expect } from "vitest";
import {
  ADMIN_DASHBOARD_SECTIONS,
  AVAILABLE_WIDGETS,
  OVERVIEW_WIDGET_IDS,
  widgetSection,
} from "./dashboardWidgets";

describe("dashboard widget sections", () => {
  it("assigns every available widget to a known section", () => {
    const known = new Set(ADMIN_DASHBOARD_SECTIONS.map((s) => s.id));
    for (const w of AVAILABLE_WIDGETS) {
      expect(known.has(widgetSection(w.id)!), w.id).toBe(true);
    }
  });

  it("has unique widget ids", () => {
    const ids = AVAILABLE_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every overview widget", () => {
    for (const id of OVERVIEW_WIDGET_IDS) expect(widgetSection(id), id).toBeDefined();
  });

  it("returns undefined for unknown ids", () => {
    expect(widgetSection("removed-widget")).toBeUndefined();
  });

  it("keeps the documented tab order", () => {
    expect(ADMIN_DASHBOARD_SECTIONS.map((s) => s.label)).toEqual([
      "Overview",
      "Approvals",
      "Hours & Trends",
      "Leave",
      "System",
      "Shortcuts",
    ]);
  });
});
