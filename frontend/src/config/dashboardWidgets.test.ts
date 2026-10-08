import { describe, it, expect } from "vitest";
import {
  ADMIN_DASHBOARD_SECTIONS,
  AVAILABLE_WIDGETS,
  OVERVIEW_WIDGET_IDS,
  PEOPLE_WIDGET_IDS,
  TRENDS_WIDGET_IDS,
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

describe("merged widget catalogue", () => {
  // id -> [w, h, section]: the owner-approved decision table (plan section 2).
  const TABLE: Record<string, [number, number, string]> = {
    "kpi-strip": [12, 2, "overview"],
    "coverage-gaps": [4, 4, "overview"],
    "approval-queue": [6, 5, "approvals"],
    "rejection-analysis": [6, 5, "approvals"],
    "hours-trend": [8, 5, "trends"],
    "ot-by-client": [4, 5, "trends"],
    "team-comparison": [6, 5, "trends"],
    "leave-trend": [6, 5, "leave"],
    "who-is-out": [4, 5, "leave"],
    "people-mix": [4, 5, "overview"],
    "period-close": [4, 3, "system"],
    "backup-status": [4, 3, "system"],
    "recent-activity": [4, 5, "system"],
    shortcuts: [12, 1, "shortcuts"],
  };

  it("lists exactly the table ids with their default size and section", () => {
    expect(AVAILABLE_WIDGETS.map((w) => w.id).sort()).toEqual(Object.keys(TABLE).sort());
    for (const w of AVAILABLE_WIDGETS) {
      const [cw, ch, section] = TABLE[w.id];
      expect(w.defaultSize, w.id).toEqual({ w: cw, h: ch });
      expect(widgetSection(w.id), w.id).toBe(section);
    }
  });

  it("keeps minimums within the default footprint and the 12-column grid", () => {
    for (const w of AVAILABLE_WIDGETS) {
      expect(w.minW).toBeGreaterThanOrEqual(1);
      expect(w.minW, w.id).toBeLessThanOrEqual(w.defaultSize.w);
      expect(w.minH, w.id).toBeLessThanOrEqual(w.defaultSize.h);
      expect(w.defaultSize.w, w.id).toBeLessThanOrEqual(12);
    }
  });

  it("only gates lazy sections on real, section-matching widget ids", () => {
    const ids = new Set(AVAILABLE_WIDGETS.map((w) => w.id));
    for (const id of [...OVERVIEW_WIDGET_IDS, ...TRENDS_WIDGET_IDS, ...PEOPLE_WIDGET_IDS]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("keeps backup-status superuser-only and nothing else", () => {
    expect(AVAILABLE_WIDGETS.filter((w) => w.superuserOnly).map((w) => w.id)).toEqual([
      "backup-status",
    ]);
  });
});
