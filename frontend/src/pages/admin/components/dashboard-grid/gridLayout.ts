import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";
import {
  adminWidgetPlacement,
  type StoredDashboardLayout,
} from "@/components/dashboard/widgetRegistry";

const GRID_LAYOUT_VERSION = 2;
const GRID_COLUMNS = 12;

/**
 * Every id the dashboard has ever stored, mapped to the widget that shows it now.
 * Merged widgets point at the same target; unchanged ones map to themselves.
 */
export const LEGACY_WIDGET_MAP: Record<string, string> = {
  "total-users": "kpi-strip",
  "total-teams": "kpi-strip",
  "pending-approvals": "kpi-strip",
  "overtime-hours": "kpi-strip",
  "org-headcount": "kpi-strip",
  "leave-utilization": "kpi-strip",
  "carryover-expiry": "kpi-strip",
  "pending-backlog": "approval-queue",
  "approval-status": "approval-queue",
  "approval-aging": "approval-queue",
  "approver-sla": "approval-queue",
  "hours-overview": "hours-trend",
  "ot-standby-trend": "hours-trend",
  "role-distribution": "people-mix",
  "tech-distribution": "people-mix",
  users: "shortcuts",
  teams: "shortcuts",
  clients: "shortcuts",
  permissions: "shortcuts",
  "calendar-mgmt": "shortcuts",
  reports: "shortcuts",
  "holiday-balances": "shortcuts",
  "coverage-gaps": "coverage-gaps",
  "rejection-analysis": "rejection-analysis",
  "ot-by-client": "ot-by-client",
  "team-comparison": "team-comparison",
  "leave-trend": "leave-trend",
  "who-is-out": "who-is-out",
  "period-close": "period-close",
  "backup-status": "backup-status",
  "recent-activity": "recent-activity",
  // Current ids are valid input too, so a half-migrated layout still resolves.
  "kpi-strip": "kpi-strip",
  "approval-queue": "approval-queue",
  "hours-trend": "hours-trend",
  "people-mix": "people-mix",
  shortcuts: "shortcuts",
};

/**
 * Brings a saved admin layout to version 2. A version-2 layout is returned as is.
 * A legacy one keeps exactly the widgets it had (merged ids collapse into one,
 * unknown ids are dropped), each at its default cell; nothing the user had hidden
 * comes back.
 */
export function migrateLayout(saved: StoredDashboardLayout): StoredDashboardLayout {
  if (saved.version === GRID_LAYOUT_VERSION) return saved;
  const seen = new Set<string>();
  const widgets: StoredDashboardLayout["widgets"] = [];
  for (const w of saved.widgets ?? []) {
    const id = LEGACY_WIDGET_MAP[w.id];
    if (!id || seen.has(id)) continue;
    const placement = adminWidgetPlacement(id);
    if (!placement) continue;
    seen.add(id);
    widgets.push(placement);
  }
  return { version: GRID_LAYOUT_VERSION, columns: GRID_COLUMNS, widgets };
}

/** Widget ids in reading order (row, then column). */
export const sortedWidgetIds = (layout: Pick<StoredDashboardLayout, "widgets">): string[] =>
  [...layout.widgets]
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .map((w) => w.id);

// ---------------------------------------------------------------------------
// Grid items: saved layout <-> react-grid-layout items, per breakpoint. Pure and free of
// the grid library, so it stays out of the main bundle and is unit-testable.
// ---------------------------------------------------------------------------

export type Breakpoint = "lg" | "md";
export const BREAKPOINT_COLS: Record<Breakpoint, number> = { lg: 12, md: 6 };

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;
}

type Placement = StoredDashboardLayout["widgets"][number];

const limitsFor = (id: string, bp: Breakpoint) => {
  const cfg = AVAILABLE_WIDGETS.find((w) => w.id === id);
  const cols = BREAKPOINT_COLS[bp];
  return {
    minW: Math.min(cols, cfg?.minW ?? 1),
    minH: cfg?.minH ?? 1,
    maxH: cfg?.maxH,
  };
};

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/** Keeps an item inside its columns and its widget's size limits. */
const clampItem = (item: GridItem, cols: number): GridItem => {
  const w = clamp(item.w, item.minW ?? 1, cols);
  const h = clamp(item.h, item.minH ?? 1, item.maxH ?? Infinity);
  return { ...item, w, h, x: clamp(item.x, 0, cols - w), y: Math.max(0, item.y) };
};

/**
 * 6-column size derived from a 12-column one: w halved (kept at least minW) and h grown by
 * half, because the same content wraps onto more lines in narrower columns.
 */
const deriveMdSize = (p: Placement) => ({
  w: clamp(Math.round(p.size.w / 2), limitsFor(p.id, "md").minW, 6),
  h: Math.ceil(p.size.h * 1.5),
});

/** First free cell (top to bottom, left to right) for a w x h block among `placed`. */
const firstFit = (placed: readonly GridItem[], w: number, h: number, cols: number) => {
  for (let y = 0; ; y += 1) {
    for (let x = 0; x + w <= cols; x += 1) {
      const probe = { i: "", x, y, w, h };
      if (!placed.some((p) => overlaps(p, probe))) return { x, y };
    }
  }
};

/**
 * Saved layout -> grid items for one breakpoint, in the order of `ids`. Ids without a
 * placement are skipped. `md` uses the stored 6-column layout when there is one for the id,
 * otherwise it is derived from `lg`.
 */
export function toGridItems(
  layout: StoredDashboardLayout,
  bp: Breakpoint,
  ids: string[],
  opts: { static?: boolean } = {}
): GridItem[] {
  const cols = BREAKPOINT_COLS[bp];
  const lg = new Map(layout.widgets.map((w) => [w.id, w]));
  const md = new Map((layout.layouts?.md ?? []).map((w) => [w.id, w]));
  const make = (id: string, p: Placement) =>
    clampItem(
      { i: id, x: p.position.x, y: p.position.y, w: p.size.w, h: p.size.h, ...limitsFor(id, bp) },
      cols
    );

  const byId = new Map<string, GridItem>();
  const stored = bp === "md" ? md : lg;
  for (const id of ids) {
    const p = stored.get(id);
    if (p) byId.set(id, make(id, p));
  }
  if (bp === "md") {
    // No stored 6-column cell: re-flow the lg layout (reading order) into the free space,
    // so a 12-column row of three widgets does not become one tall column.
    const fixed = [...byId.values()];
    const flowed: GridItem[] = [];
    const reading = ids
      .map((id) => lg.get(id))
      .filter((p): p is Placement => !!p && !byId.has(p.id))
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    for (const p of reading) {
      const { w, h } = deriveMdSize(p);
      const item = make(p.id, { id: p.id, position: { x: 0, y: 0 }, size: { w, h } });
      const at = firstFit([...fixed, ...flowed], item.w, item.h, cols);
      flowed.push({ ...item, ...at });
    }
    for (const it of flowed) byId.set(it.i, it);
  }

  const items: GridItem[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    if (item.maxH === undefined) delete item.maxH;
    if (opts.static) item.static = true;
    items.push(item);
  }
  return items;
}

const toPlacement = (it: GridItem): Placement => ({
  id: it.i,
  position: { x: it.x, y: it.y },
  size: { w: it.w, h: it.h },
});

/** Grid items -> saved layout: `lg` updates `widgets`, `md` updates `layouts.md`. */
export function fromGridItems(
  layout: StoredDashboardLayout,
  bp: Breakpoint,
  items: readonly GridItem[]
): StoredDashboardLayout {
  const byId = new Map(items.map((it) => [it.i, it]));
  if (bp === "lg") {
    return {
      ...layout,
      version: GRID_LAYOUT_VERSION,
      columns: GRID_COLUMNS,
      widgets: layout.widgets.map((w) => {
        const it = byId.get(w.id);
        return it ? toPlacement(it) : w;
      }),
    };
  }
  const kept = (layout.layouts?.md ?? []).filter((p) => !byId.has(p.id));
  return {
    ...layout,
    version: GRID_LAYOUT_VERSION,
    columns: GRID_COLUMNS,
    layouts: { ...layout.layouts, md: [...kept, ...items.map(toPlacement)] },
  };
}

/** True when both lists place the same ids at the same cells (limits are ignored). */
export function sameItems(a: readonly GridItem[], b: readonly GridItem[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Map(b.map((it) => [it.i, it]));
  return a.every((it) => {
    const o = other.get(it.i);
    return !!o && o.x === it.x && o.y === it.y && o.w === it.w && o.h === it.h;
  });
}

const overlaps = (a: GridItem, b: GridItem) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Vertical compaction: the priority item keeps its cell, every other item is placed in
 * reading order at the highest row where it collides with nothing already placed.
 */
export function packVertical(items: readonly GridItem[], priorityId?: string): GridItem[] {
  const priority = items.find((it) => it.i === priorityId);
  const placed: GridItem[] = priority ? [{ ...priority }] : [];
  const rest = items.filter((it) => it !== priority).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of rest) {
    const next = { ...it, y: 0 };
    while (placed.some((p) => overlaps(p, next))) next.y += 1;
    placed.push(next);
  }
  const order = new Map(items.map((it, idx) => [it.i, idx]));
  return placed.sort((a, b) => order.get(a.i)! - order.get(b.i)!);
}

export interface KeyboardAction {
  dir: "left" | "right" | "up" | "down";
  resize: boolean;
}

const DELTA = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const;

/**
 * One keyboard step on the grip button: move one cell, or resize one cell with Shift.
 * Returns the repacked items and a screen-reader announcement, or null when the step is
 * not possible (grid edge, min/max size, unknown id).
 */
export function applyKeyboardAction(
  items: readonly GridItem[],
  id: string,
  action: KeyboardAction,
  cols: number,
  titleOf: (id: string) => string
): { items: GridItem[]; announcement: string } | null {
  const current = items.find((it) => it.i === id);
  if (!current) return null;
  const [dx, dy] = DELTA[action.dir];
  const next: GridItem = { ...current };
  if (action.resize) {
    next.w = current.w + dx;
    next.h = current.h + dy;
    if (
      next.w < (current.minW ?? 1) ||
      next.h < (current.minH ?? 1) ||
      next.w > cols - current.x ||
      next.h > (current.maxH ?? Infinity)
    ) {
      return null;
    }
  } else {
    next.x = current.x + dx;
    next.y = current.y + dy;
    if (next.x < 0 || next.y < 0 || next.x + next.w > cols) return null;
  }
  const packed = packVertical(
    items.map((it) => (it.i === id ? next : it)),
    id
  );
  const final = packed.find((it) => it.i === id)!;
  const title = titleOf(id);
  return {
    items: packed,
    announcement: action.resize
      ? `Resized ${title} to ${final.w} by ${final.h}`
      : `Moved ${title} to column ${final.x + 1}, row ${final.y + 1}`,
  };
}

/** Container width from which the grid uses 12 columns (the sidebar takes ~260px of the viewport). */
export const LG_MIN_WIDTH = 900;
/** Narrower than this a grid is pointless (also what an unmeasured container reports). */
const MIN_GRID_WIDTH = 320;

/**
 * Grid breakpoint for the container: 12 columns at `lg`, 6 at `md`. `null` means a plain
 * single column: phones (viewport < 768px) and containers too narrow to hold a grid.
 */
export const breakpointFor = (width: number, isMobile: boolean): Breakpoint | null =>
  isMobile || width < MIN_GRID_WIDTH ? null : width >= LG_MIN_WIDTH ? "lg" : "md";
