import { describe, it, expect } from "vitest";
import { defaultAdminLayout } from "@/components/dashboard/widgetRegistry";
import {
  applyKeyboardAction,
  fromGridItems,
  packVertical,
  sameItems,
  toGridItems,
  type GridItem,
} from "./gridLayout";

const IDS = defaultAdminLayout.widgets.map((w) => w.id);

describe("toGridItems", () => {
  it("maps lg placements 1:1 with the config limits", () => {
    const items = toGridItems(defaultAdminLayout, "lg", IDS);
    const hours = items.find((i) => i.i === "hours-trend")!;
    expect(hours).toMatchObject({ x: 0, w: 8, h: 5, minW: 4, minH: 4 });
    expect(items.find((i) => i.i === "recent-activity")!.maxH).toBe(8);
    expect(items.find((i) => i.i === "approval-queue")!.maxH).toBeUndefined();
  });

  it("derives md from lg: halves x and w, clamps to the minimum, stays inside 6 columns", () => {
    const items = toGridItems(defaultAdminLayout, "md", IDS);
    for (const it of items) {
      expect(it.x + it.w).toBeLessThanOrEqual(6);
      expect(it.w).toBeGreaterThanOrEqual(it.minW!);
    }
    expect(items.find((i) => i.i === "kpi-strip")!.w).toBe(6);
    expect(items.find((i) => i.i === "hours-trend")!.w).toBe(4);
    // lg w=4 halves to 2, but who-is-out needs 3
    expect(items.find((i) => i.i === "who-is-out")!.w).toBe(3);
    // narrower columns wrap content onto more lines: 2 rows become 3 (kpi-strip, capped at maxH 3)
    expect(items.find((i) => i.i === "kpi-strip")!.h).toBe(3);
    expect(items.find((i) => i.i === "hours-trend")!.h).toBe(8);
  });

  it("re-flows the derived md layout instead of stacking a 12-column row into one column", () => {
    const items = toGridItems(defaultAdminLayout, "md", IDS);
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const p = items[a];
        const q = items[b];
        const clash = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        expect(clash, `${p.i} overlaps ${q.i}`).toBe(false);
      }
    }
    const at = (id: string) => items.find((i) => i.i === id)!;
    // coverage-gaps and people-mix shared a lg row: they now sit side by side
    expect(at("coverage-gaps")).toMatchObject({ x: 0 });
    expect(at("people-mix")).toMatchObject({ x: 3, y: at("coverage-gaps").y });
  });

  it("prefers a stored md layout over the derived one", () => {
    const layout = {
      ...defaultAdminLayout,
      layouts: { md: [{ id: "who-is-out", position: { x: 2, y: 9 }, size: { w: 4, h: 5 } }] },
    };
    expect(toGridItems(layout, "md", ["who-is-out"])[0]).toMatchObject({ x: 2, y: 9, w: 4 });
  });

  it("clamps a stored item that exceeds the columns or limits", () => {
    const layout = {
      ...defaultAdminLayout,
      layouts: { md: [{ id: "shortcuts", position: { x: 5, y: 0 }, size: { w: 9, h: 9 } }] },
    };
    const sc = toGridItems(layout, "md", ["shortcuts"])[0];
    expect(sc.w).toBe(6);
    expect(sc.x).toBe(0);
    expect(sc.h).toBe(2);
  });

  it("skips ids without a placement and marks items static on request", () => {
    const items = toGridItems(defaultAdminLayout, "lg", ["nope", "shortcuts"], { static: true });
    expect(items.map((i) => i.i)).toEqual(["shortcuts"]);
    expect(items[0].static).toBe(true);
  });

  it("returns items in the order of the given ids", () => {
    const items = toGridItems(defaultAdminLayout, "lg", ["shortcuts", "kpi-strip"]);
    expect(items.map((i) => i.i)).toEqual(["shortcuts", "kpi-strip"]);
  });
});

describe("fromGridItems", () => {
  it("writes lg back into widgets and leaves everything else alone", () => {
    const next = fromGridItems(defaultAdminLayout, "lg", [
      { i: "kpi-strip", x: 2, y: 4, w: 10, h: 2 },
    ]);
    const k = next.widgets.find((w) => w.id === "kpi-strip")!;
    expect(k.position).toEqual({ x: 2, y: 4 });
    expect(k.size).toEqual({ w: 10, h: 2 });
    expect(next.widgets).toHaveLength(defaultAdminLayout.widgets.length);
    expect(next.widgets.find((w) => w.id === "shortcuts")).toEqual(
      defaultAdminLayout.widgets.find((w) => w.id === "shortcuts")
    );
    expect(next.version).toBe(2);
    expect(next.columns).toBe(12);
    expect(next.layouts?.md).toBeUndefined();
  });

  it("writes md into layouts.md without touching lg", () => {
    const next = fromGridItems(defaultAdminLayout, "md", [
      { i: "kpi-strip", x: 0, y: 3, w: 6, h: 2 },
    ]);
    expect(next.widgets).toEqual(defaultAdminLayout.widgets);
    expect(next.layouts?.md).toEqual([
      { id: "kpi-strip", position: { x: 0, y: 3 }, size: { w: 6, h: 2 } },
    ]);
  });

  it("keeps stored md entries of widgets that were not in the gesture", () => {
    const base = {
      ...defaultAdminLayout,
      layouts: { md: [{ id: "shortcuts", position: { x: 0, y: 8 }, size: { w: 6, h: 1 } }] },
    };
    const next = fromGridItems(base, "md", [{ i: "kpi-strip", x: 0, y: 0, w: 6, h: 2 }]);
    expect(next.layouts?.md?.map((p) => p.id).sort()).toEqual(["kpi-strip", "shortcuts"]);
  });

  it("round-trips lg", () => {
    const items = toGridItems(defaultAdminLayout, "lg", IDS);
    expect(fromGridItems(defaultAdminLayout, "lg", items)).toEqual(defaultAdminLayout);
  });
});

describe("sameItems", () => {
  it("compares geometry only", () => {
    const a: GridItem[] = [{ i: "a", x: 0, y: 0, w: 2, h: 2, minW: 1 }];
    expect(sameItems(a, [{ i: "a", x: 0, y: 0, w: 2, h: 2 }])).toBe(true);
    expect(sameItems(a, [{ i: "a", x: 1, y: 0, w: 2, h: 2 }])).toBe(false);
    expect(sameItems(a, [])).toBe(false);
  });
});

describe("packVertical", () => {
  it("pushes overlapping items down and floats gaps up", () => {
    const out = packVertical([
      { i: "a", x: 0, y: 0, w: 6, h: 2 },
      { i: "b", x: 0, y: 1, w: 6, h: 2 },
      { i: "c", x: 6, y: 5, w: 6, h: 2 },
    ]);
    const at = (id: string) => out.find((o) => o.i === id)!;
    expect(at("a").y).toBe(0);
    expect(at("b").y).toBe(2);
    expect(at("c").y).toBe(0);
  });

  it("lets the priority item keep its place", () => {
    const out = packVertical(
      [
        { i: "a", x: 0, y: 0, w: 6, h: 2 },
        { i: "b", x: 0, y: 0, w: 6, h: 2 },
      ],
      "b"
    );
    expect(out.find((o) => o.i === "b")!.y).toBe(0);
    expect(out.find((o) => o.i === "a")!.y).toBe(2);
  });
});

describe("applyKeyboardAction", () => {
  const items: GridItem[] = [
    { i: "a", x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2, maxH: 5 },
    { i: "b", x: 4, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  ];
  const title = (id: string) => id.toUpperCase();
  const move = (dir: "left" | "right" | "up" | "down") => ({ dir, resize: false });
  const size = (dir: "left" | "right" | "up" | "down") => ({ dir, resize: true });

  it("moves one cell right and announces column and row (1-based)", () => {
    const r = applyKeyboardAction(items, "a", move("right"), 12, title)!;
    expect(r.items.find((i) => i.i === "a")).toMatchObject({ x: 1, y: 0 });
    expect(r.announcement).toBe("Moved A to column 2, row 1");
  });

  it("does not move past the grid edge", () => {
    expect(applyKeyboardAction(items, "a", move("left"), 12, title)).toBeNull();
    expect(applyKeyboardAction(items, "a", move("up"), 12, title)).toBeNull();
    const edge = [{ i: "a", x: 8, y: 0, w: 4, h: 3 }];
    expect(applyKeyboardAction(edge, "a", move("right"), 12, title)).toBeNull();
  });

  it("moves down freely", () => {
    const r = applyKeyboardAction(items, "b", move("down"), 12, title)!;
    expect(r.items.find((i) => i.i === "b")!.y).toBe(1);
    expect(r.announcement).toBe("Moved B to column 5, row 2");
  });

  it("resizes by one cell and announces width by height", () => {
    const r = applyKeyboardAction(items, "a", size("down"), 12, title)!;
    expect(r.items.find((i) => i.i === "a")!.h).toBe(4);
    expect(r.announcement).toBe("Resized A to 4 by 4");
  });

  it("respects min and max when resizing", () => {
    const tall = [{ i: "a", x: 0, y: 0, w: 4, h: 5, minW: 2, minH: 2, maxH: 5 }];
    expect(applyKeyboardAction(tall, "a", size("down"), 12, title)).toBeNull();
    const small = [{ i: "a", x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2 }];
    expect(applyKeyboardAction(small, "a", size("left"), 12, title)).toBeNull();
    expect(applyKeyboardAction(small, "a", size("up"), 12, title)).toBeNull();
  });

  it("keeps a resized item inside the columns", () => {
    const edge = [{ i: "a", x: 8, y: 0, w: 4, h: 2 }];
    expect(applyKeyboardAction(edge, "a", size("right"), 12, title)).toBeNull();
  });

  it("ignores an unknown id", () => {
    expect(applyKeyboardAction(items, "zzz", move("up"), 12, title)).toBeNull();
  });
});
