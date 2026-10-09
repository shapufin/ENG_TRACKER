import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { defaultAdminLayout } from "@/components/dashboard/widgetRegistry";
import { DashboardGrid } from "./DashboardGrid";
import { breakpointFor } from "./gridLayout";

// jsdom does no layout: stand in for the grid library and assert on the props we hand it.
const grid = vi.hoisted(() => ({
  width: 1200,
  mobile: false,
  mounted: true,
  props: null as Record<string, unknown> | null,
}));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => grid.mobile }));
vi.mock("react-grid-layout", () => ({
  useContainerWidth: () => ({
    width: grid.width,
    containerRef: { current: null },
    mounted: grid.mounted,
  }),
  ResponsiveGridLayout: (props: Record<string, unknown> & { children: React.ReactNode }) => {
    grid.props = props;
    return <div data-testid="rgl">{props.children}</div>;
  },
}));
vi.mock("react-grid-layout/core", () => ({ verticalCompactor: { type: "vertical" } }));

type Item = { i: string; x: number; y: number; w: number; h: number };

const ids = ["kpi-strip", "hours-trend", "shortcuts"];
const titles: Record<string, string> = {
  "kpi-strip": "Key Figures",
  "hours-trend": "Hours",
  shortcuts: "Shortcuts",
};

const setup = (over: Partial<React.ComponentProps<typeof DashboardGrid>> = {}) => {
  const onLayoutChange = vi.fn();
  const onRemove = vi.fn();
  render(
    <DashboardGrid
      layout={defaultAdminLayout}
      widgetIds={ids}
      editing={false}
      titleOf={(id) => titles[id]}
      renderWidget={(id) => <p>body {id}</p>}
      onLayoutChange={onLayoutChange}
      onRemove={onRemove}
      {...over}
    />
  );
  return { onLayoutChange, onRemove };
};

const gridProps = () => grid.props as Record<string, any>;

beforeEach(() => {
  grid.width = 1200;
  grid.mobile = false;
  grid.mounted = true;
  grid.props = null;
});

describe("breakpointFor", () => {
  it("picks lg or md from the container width on a non-phone viewport", () => {
    expect(breakpointFor(1400, false)).toBe("lg");
    expect(breakpointFor(900, false)).toBe("lg");
    expect(breakpointFor(899, false)).toBe("md");
    expect(breakpointFor(446, false)).toBe("md");
  });

  it("is a plain stack (null) on phones and in an unmeasured or tiny container", () => {
    expect(breakpointFor(1400, true)).toBeNull();
    expect(breakpointFor(0, false)).toBeNull();
    expect(breakpointFor(319, false)).toBeNull();
  });
});

describe("DashboardGrid at lg", () => {
  it("renders every widget as a grid child with 12-column items", () => {
    setup();
    expect(screen.getByTestId("rgl")).toBeInTheDocument();
    for (const id of ids) expect(screen.getByText(`body ${id}`)).toBeInTheDocument();
    const { layouts, cols, breakpoints } = gridProps();
    expect(layouts.lg.map((i: Item) => i.i).sort()).toEqual([...ids].sort());
    expect(cols).toEqual({ lg: 12, md: 6 });
    expect(breakpoints.md).toBeLessThan(breakpoints.lg);
  });

  it("outside edit mode: no grip, no remove, drag and resize off", () => {
    setup();
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(gridProps().dragConfig.enabled).toBe(false);
    expect(gridProps().resizeConfig.enabled).toBe(false);
  });

  it("in edit mode: grip and remove per widget, drag only from the grip, resize on", () => {
    const { onRemove } = setup({ editing: true });
    expect(screen.getByRole("button", { name: "Move Hours" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Hours" }));
    expect(onRemove).toHaveBeenCalledWith("hours-trend");
    const { dragConfig, resizeConfig } = gridProps();
    expect(dragConfig.enabled).toBe(true);
    expect(dragConfig.handle).toBe(".dashboard-grid-grip");
    expect(resizeConfig.enabled).toBe(true);
    expect(document.querySelector(".dashboard-grid-grip")).toBe(
      screen.getByRole("button", { name: "Move Key Figures" })
    );
  });

  it("saves once per finished gesture, not per layout tick", () => {
    const { onLayoutChange } = setup({ editing: true });
    const { onLayoutChange: tick, onDragStop, onResizeStop } = gridProps();
    expect(tick).toBeUndefined();
    const lg = gridProps().layouts.lg as Item[];
    const moved = lg.map((i) => (i.i === "hours-trend" ? { ...i, h: i.h + 1 } : i));
    act(() => onDragStop(moved));
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    const saved = onLayoutChange.mock.calls[0][0];
    expect(saved.widgets.find((w: { id: string }) => w.id === "hours-trend").size.h).toBe(6);
    // A gesture that moves nothing saves nothing.
    onLayoutChange.mockClear();
    act(() => onResizeStop(lg));
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it("a click on a grip over a stored layout with a gap saves nothing", () => {
    const gappy = {
      ...defaultAdminLayout,
      widgets: defaultAdminLayout.widgets.map((w) =>
        w.id === "shortcuts" ? { ...w, position: { x: 0, y: 40 } } : w
      ),
    };
    const { onLayoutChange } = setup({ editing: true, layout: gappy });
    // The grid reports its compacted layout on drag stop even when nothing moved.
    const compacted = (gridProps().layouts.lg as Item[]).map((i) =>
      i.i === "shortcuts" ? { ...i, y: 12 } : i
    );
    act(() => gridProps().onDragStop(compacted));
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it("holds the space with a skeleton until the container is measured", () => {
    grid.mounted = false;
    setup();
    expect(document.querySelector("[data-grid-skeleton]")).not.toBeNull();
    expect(screen.queryByTestId("rgl")).toBeNull();
  });

  it("moves a widget from the keyboard and announces it", () => {
    const { onLayoutChange } = setup({ editing: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Hours" }), {
      key: "ArrowRight",
      altKey: true,
    });
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/Moved Hours to column \d+, row \d+/);
  });

  it("grab mode: Enter grabs, plain arrows move, Escape drops and is marked handled", () => {
    const { onLayoutChange } = setup({ editing: true });
    const grip = screen.getByRole("button", { name: "Move Hours" });
    fireEvent.keyDown(grip, { key: "Enter" });
    expect(grip).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      grip.dispatchEvent(esc);
    });
    expect(esc.defaultPrevented).toBe(true);
    expect(grip).toHaveAttribute("aria-pressed", "false");
  });

  it("removing a widget moves focus to the next widget's grip", () => {
    const { onRemove } = setup({ editing: true });
    const remove = screen.getByRole("button", { name: "Remove Key Figures" });
    remove.focus();
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith("kpi-strip");
    // Reading order is kpi-strip, hours-trend, shortcuts.
    expect(screen.getByRole("button", { name: "Move Hours" })).toHaveFocus();
  });

  it("removing the last widget falls back to the previous grip", () => {
    setup({ editing: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove Shortcuts" }));
    expect(screen.getByRole("button", { name: "Move Hours" })).toHaveFocus();
  });

  it("removing the only widget falls back to the Edit layout toggle", () => {
    render(<button data-dashboard-edit-toggle>Done</button>);
    setup({ editing: true, widgetIds: ["shortcuts"] });
    fireEvent.click(screen.getByRole("button", { name: "Remove Shortcuts" }));
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
  });

  it("ignores arrows without Alt so the page keeps scrolling", () => {
    const { onLayoutChange } = setup({ editing: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Hours" }), { key: "ArrowDown" });
    expect(onLayoutChange).not.toHaveBeenCalled();
  });
});

describe("DashboardGrid at md", () => {
  it("uses the 6-column items and saves them as the md layout", () => {
    grid.width = 800;
    const { onLayoutChange } = setup({ editing: true });
    const md = gridProps().layouts.md as Item[];
    expect(md.every((i) => i.x + i.w <= 6)).toBe(true);
    act(() => gridProps().onDragStop(md.map((i) => (i.i === "hours-trend" ? { ...i, h: 9 } : i))));
    const saved = onLayoutChange.mock.calls[0][0];
    expect(saved.widgets).toEqual(defaultAdminLayout.widgets);
    expect(saved.layouts.md.find((p: { id: string }) => p.id === "hours-trend").size.h).toBe(9);
  });
});

describe("DashboardGrid below md (stack)", () => {
  beforeEach(() => {
    grid.width = 343;
    grid.mobile = true;
  });

  it("is a plain single column: no grid library, no handles, even in edit mode", () => {
    setup({ editing: true });
    expect(screen.queryByTestId("rgl")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(document.querySelector("[data-grid-mode='stack']")).not.toBeNull();
  });

  it("keeps saved reading order (row, then column)", () => {
    setup();
    const order = [...document.querySelectorAll<HTMLElement>("[data-grid-cell]")].map(
      (c) => c.dataset.gridCell
    );
    expect(order).toEqual(["kpi-strip", "hours-trend", "shortcuts"]);
  });
});
