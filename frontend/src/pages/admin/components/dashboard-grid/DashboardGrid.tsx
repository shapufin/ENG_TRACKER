import React, { useCallback, useMemo } from "react";
import { ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import { verticalCompactor } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./dashboardGrid.css";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { StoredDashboardLayout } from "@/components/dashboard/widgetRegistry";
import {
  BREAKPOINT_COLS,
  LG_MIN_WIDTH,
  breakpointFor,
  fromGridItems,
  sameItems,
  toGridItems,
  type Breakpoint,
  type GridItem,
} from "./gridLayout";
import { NO_DRAG_CLASS, GRIP_CLASS, WidgetShell } from "./WidgetShell";
import { useGridKeyboard } from "./useGridKeyboard";

const ROW_HEIGHT = 60;
const MARGIN: [number, number] = [16, 16];

const heightFor = (rows: number) => rows * ROW_HEIGHT + (rows - 1) * MARGIN[1];

interface DashboardGridProps {
  layout: StoredDashboardLayout;
  /** Widgets to show, any order (reading order comes from `layout`). */
  widgetIds: string[];
  /** Edit mode: grip, resize handles and remove buttons. Ignored in the single-column stack. */
  editing: boolean;
  titleOf: (id: string) => string;
  renderWidget: (id: string) => React.ReactNode;
  /** Called once per finished gesture (drag stop, resize stop, accepted key press). */
  onLayoutChange: (next: StoredDashboardLayout) => void;
  onRemove: (id: string) => void;
}

/**
 * The admin dashboard grid. At `lg` (12 columns) and `md` (6) it is a react-grid-layout
 * grid; below `md` it is a plain stack in saved order with no drag or resize, so touch
 * scrolling is never hijacked. Positions are saved when a gesture ends, never per tick.
 */
export const DashboardGrid: React.FC<DashboardGridProps> = ({
  layout,
  widgetIds,
  editing,
  titleOf,
  renderWidget,
  onLayoutChange,
  onRemove,
}) => {
  const { width, containerRef, mounted } = useContainerWidth();
  const isMobile = useIsMobile();
  const bp = breakpointFor(width, isMobile);
  const gridBp: Breakpoint = bp ?? "lg";
  const cols = BREAKPOINT_COLS[gridBp];
  const canEdit = editing && bp !== null;

  const lgItems = useMemo(() => toGridItems(layout, "lg", widgetIds), [layout, widgetIds]);
  const mdItems = useMemo(() => toGridItems(layout, "md", widgetIds), [layout, widgetIds]);
  const items = gridBp === "lg" ? lgItems : mdItems;
  const layouts = useMemo(() => ({ lg: lgItems, md: mdItems }), [lgItems, mdItems]);

  const commit = useCallback(
    (next: readonly GridItem[]) => {
      if (sameItems(next, items)) return;
      onLayoutChange(fromGridItems(layout, gridBp, next));
    },
    [items, layout, gridBp, onLayoutChange]
  );

  const { announcement, onGripKeyDown } = useGridKeyboard({
    items,
    cols,
    titleOf,
    onChange: commit,
  });

  // Reading order for the stack: the lg layout, row then column.
  const stackOrder = useMemo(
    () => [...lgItems].sort((a, b) => a.y - b.y || a.x - b.x).map((it) => ({ id: it.i, h: it.h })),
    [lgItems]
  );

  const shell = (id: string) => (
    <WidgetShell
      id={id}
      title={titleOf(id)}
      editing={canEdit}
      onRemove={() => onRemove(id)}
      onGripKeyDown={onGripKeyDown(id)}
    >
      {renderWidget(id)}
    </WidgetShell>
  );

  return (
    <div ref={containerRef} data-grid-mode={bp ?? "stack"}>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {!mounted ? null : bp === null ? (
        <div className="flex flex-col gap-4">
          {stackOrder.map(({ id, h }) => (
            <div
              key={id}
              data-grid-cell={id}
              style={{ minHeight: heightFor(h) }}
              className="min-w-0"
            >
              {shell(id)}
            </div>
          ))}
        </div>
      ) : (
        <ResponsiveGridLayout
          width={width}
          layouts={layouts}
          breakpoints={{ lg: LG_MIN_WIDTH, md: 0 }}
          cols={BREAKPOINT_COLS}
          margin={MARGIN}
          containerPadding={[0, 0]}
          rowHeight={ROW_HEIGHT}
          compactor={verticalCompactor}
          dragConfig={{ enabled: canEdit, handle: `.${GRIP_CLASS}`, cancel: `.${NO_DRAG_CLASS}` }}
          resizeConfig={{ enabled: canEdit, handles: ["se"] }}
          onDragStop={commit}
          onResizeStop={commit}
        >
          {items.map((it) => (
            <div key={it.i} data-grid-cell={it.i} className="min-w-0">
              {shell(it.i)}
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
};
