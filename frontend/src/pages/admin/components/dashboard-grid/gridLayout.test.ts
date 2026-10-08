import { describe, it, expect } from "vitest";
import { defaultAdminLayout } from "@/components/dashboard/widgetRegistry";
import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";
import { LEGACY_WIDGET_MAP, migrateLayout, sortedWidgetIds } from "./gridLayout";

const OLD_IDS = [
  "total-users",
  "total-teams",
  "pending-approvals",
  "overtime-hours",
  "org-headcount",
  "leave-utilization",
  "carryover-expiry",
  "pending-backlog",
  "approval-status",
  "approval-aging",
  "approver-sla",
  "hours-overview",
  "ot-standby-trend",
  "role-distribution",
  "tech-distribution",
  "users",
  "teams",
  "clients",
  "permissions",
  "calendar-mgmt",
  "reports",
  "holiday-balances",
  "coverage-gaps",
  "rejection-analysis",
  "ot-by-client",
  "team-comparison",
  "leave-trend",
  "who-is-out",
  "period-close",
  "backup-status",
  "recent-activity",
];

const legacy = (ids: string[]) => ({
  columns: 4,
  widgets: ids.map((id, i) => ({
    id,
    position: { x: i % 4, y: Math.floor(i / 4) },
    size: { w: 1, h: 1 },
  })),
});

const newIds = new Set(AVAILABLE_WIDGETS.map((w) => w.id));

describe("LEGACY_WIDGET_MAP", () => {
  it("covers every id the dashboard ever stored (31)", () => {
    expect(OLD_IDS).toHaveLength(31);
    for (const id of OLD_IDS) expect(LEGACY_WIDGET_MAP[id], id).toBeDefined();
  });

  it("only ever maps to an id that exists in AVAILABLE_WIDGETS", () => {
    for (const [oldId, id] of Object.entries(LEGACY_WIDGET_MAP)) {
      expect(newIds.has(id), `${oldId} -> ${id}`).toBe(true);
    }
  });

  it.each([
    [
      "kpi-strip",
      [
        "total-users",
        "total-teams",
        "pending-approvals",
        "overtime-hours",
        "org-headcount",
        "leave-utilization",
        "carryover-expiry",
      ],
    ],
    ["approval-queue", ["pending-backlog", "approval-status", "approval-aging", "approver-sla"]],
    ["hours-trend", ["hours-overview", "ot-standby-trend"]],
    ["people-mix", ["role-distribution", "tech-distribution"]],
    [
      "shortcuts",
      ["users", "teams", "clients", "permissions", "calendar-mgmt", "reports", "holiday-balances"],
    ],
  ])("merges into %s", (target, olds) => {
    for (const o of olds) expect(LEGACY_WIDGET_MAP[o]).toBe(target);
  });

  it("keeps unchanged ids as themselves", () => {
    for (const id of [
      "coverage-gaps",
      "rejection-analysis",
      "ot-by-client",
      "team-comparison",
      "leave-trend",
      "who-is-out",
      "period-close",
      "backup-status",
      "recent-activity",
    ]) {
      expect(LEGACY_WIDGET_MAP[id]).toBe(id);
    }
  });
});

describe("migrateLayout", () => {
  it.each(OLD_IDS)("migrates a legacy layout holding only %s", (oldId) => {
    const out = migrateLayout(legacy([oldId]));
    expect(out.version).toBe(2);
    expect(out.columns).toBe(12);
    expect(out.widgets.map((w) => w.id)).toEqual([LEGACY_WIDGET_MAP[oldId]]);
  });

  it("uses the default position and size of the new widget", () => {
    const out = migrateLayout(legacy(["total-users"]));
    const def = defaultAdminLayout.widgets.find((w) => w.id === "kpi-strip");
    expect(out.widgets[0]).toEqual(def);
    expect(out.widgets[0].size).toEqual({ w: 12, h: 2 });
  });

  it("de-duplicates merged ids, keeping the first occurrence order", () => {
    const out = migrateLayout(
      legacy(["users", "hours-overview", "total-users", "teams", "ot-standby-trend"])
    );
    expect(out.widgets.map((w) => w.id)).toEqual(["shortcuts", "hours-trend", "kpi-strip"]);
  });

  it("drops unknown ids", () => {
    const out = migrateLayout(legacy(["nope", "reports", "ghost"]));
    expect(out.widgets.map((w) => w.id)).toEqual(["shortcuts"]);
  });

  it("does not add a merged group the user never had", () => {
    const out = migrateLayout(legacy(["who-is-out"]));
    expect(out.widgets.map((w) => w.id)).toEqual(["who-is-out"]);
  });

  it("keeps an empty legacy layout empty (user hid everything)", () => {
    expect(migrateLayout({ columns: 4, widgets: [] })).toEqual({
      version: 2,
      columns: 12,
      widgets: [],
    });
  });

  it("migrates a layout with a missing widgets array to empty", () => {
    expect(migrateLayout({ columns: 4 } as never).widgets).toEqual([]);
  });

  it("is idempotent on version 2 and returns it untouched", () => {
    const v2 = {
      version: 2,
      columns: 12,
      widgets: [{ id: "who-is-out", position: { x: 5, y: 9 }, size: { w: 6, h: 3 } }],
    };
    expect(migrateLayout(v2)).toEqual(v2);
    expect(migrateLayout(migrateLayout(legacy(["total-users", "users"])))).toEqual(
      migrateLayout(legacy(["total-users", "users"]))
    );
  });

  it("maps the old default layout to the five merged widgets", () => {
    const oldDefault = [
      "total-users",
      "total-teams",
      "pending-approvals",
      "overtime-hours",
      "hours-overview",
      "approval-status",
      "recent-activity",
      "users",
      "teams",
      "clients",
      "permissions",
      "calendar-mgmt",
      "reports",
      "holiday-balances",
    ];
    expect(migrateLayout(legacy(oldDefault)).widgets.map((w) => w.id)).toEqual([
      "kpi-strip",
      "hours-trend",
      "approval-queue",
      "recent-activity",
      "shortcuts",
    ]);
  });
});

describe("sortedWidgetIds", () => {
  it("orders by row then column", () => {
    expect(
      sortedWidgetIds({
        widgets: [
          { id: "b", position: { x: 6, y: 0 }, size: { w: 1, h: 1 } },
          { id: "c", position: { x: 0, y: 2 }, size: { w: 1, h: 1 } },
          { id: "a", position: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
        ],
      })
    ).toEqual(["a", "b", "c"]);
  });
});
