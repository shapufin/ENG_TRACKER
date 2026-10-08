import React, { createContext, useContext, useMemo } from "react";
import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";
import { cn } from "@/lib/utils";

// Static class names so Tailwind can see them. Widths are 12-column units; below `md` a
// widget is full width, at `md` (6 columns) wide widgets take the row and narrow ones half.
const LG_SPAN: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
};
const MD_SPAN = { full: "md:col-span-6", half: "md:col-span-3" };
const LG_MIN_HEIGHT: Record<number, string> = {
  1: "lg:min-h-0",
  2: "lg:min-h-24",
  3: "lg:min-h-40",
  4: "lg:min-h-56",
  5: "lg:min-h-72",
};

const OrderContext = createContext<Record<string, number> | null>(null);

/** Gives the cells below a reading order (saved layout row, then column). */
export const GridOrderProvider: React.FC<{ order: string[]; children: React.ReactNode }> = ({
  order,
  children,
}) => {
  const byId = useMemo(() => Object.fromEntries(order.map((id, i) => [id, i])), [order]);
  return <OrderContext.Provider value={byId}>{children}</OrderContext.Provider>;
};

/**
 * One widget's cell in the dashboard grid: its default footprint as classes and its
 * position in the saved reading order as CSS `order`. The drag/resize grid replaces
 * this wrapper; the widgets inside do not change.
 */
export const GridCell: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
  const order = useContext(OrderContext)?.[id];
  const size = AVAILABLE_WIDGETS.find((w) => w.id === id)?.defaultSize ?? { w: 4, h: 4 };
  return (
    <div
      data-grid-cell={id}
      style={order === undefined ? undefined : { order }}
      className={cn(
        "min-w-0 *:h-full",
        LG_SPAN[size.w] ?? "lg:col-span-4",
        size.w >= 8 ? MD_SPAN.full : MD_SPAN.half,
        LG_MIN_HEIGHT[size.h]
      )}
    >
      {children}
    </div>
  );
};
