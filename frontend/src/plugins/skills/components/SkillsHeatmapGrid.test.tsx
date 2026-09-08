import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsHeatmapGrid } from "./SkillsHeatmapGrid";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  }
);

// Shared mock for virtualizer.measure — vi.hoisted so it's available inside
// the hoisted vi.mock factory.
const mocks = vi.hoisted(() => ({
  measure: vi.fn(),
}));

// Mock @tanstack/react-virtual — jsdom returns 0 for clientWidth/scrollWidth,
// so the virtualizer would render 0 columns without this mock.
// The mock returns `start` values with 100px spacing to simulate a STALE
// virtualizer size cache (the real bug: the virtualizer caches the initial
// 64px estimate and doesn't recompute when skillColWidth changes). The
// component must compute `left` from `index * skillColWidth`, NOT from
// `virtualItem.start`, so columns don't overlap.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        index: i,
        // Stale 100px spacing — differs from skillColWidth (64 in jsdom)
        start: 160 + i * 100,
        size: 100,
        key: i,
        lane: 0,
      })),
    getTotalSize: () => opts.count * 100,
    measureElement: () => {},
    measure: mocks.measure,
    scrollToIndex: vi.fn(),
    containerRef: { current: null },
  }),
}));

const coverage: SkillCoverage[] = [
  {
    skill_id: 10,
    skill_name: "Python",
    category_name: "Backend",
    team_count: 2,
    avg_level: 3.5,
  },
  {
    skill_id: 20,
    skill_name: "React",
    category_name: "Frontend",
    team_count: 2,
    avg_level: 2,
  },
];

const rows: TeamMatrixRow[] = [
  {
    user_id: 100,
    username: "alice",
    skills: [
      {
        user_skill_id: 999,
        skill_id: 10,
        skill_name: "Python",
        category_name: "Backend",
        level: 3,
      },
      {
        user_skill_id: 998,
        skill_id: 20,
        skill_name: "React",
        category_name: "Frontend",
        level: 2,
      },
    ],
  },
  {
    user_id: 200,
    username: "bob",
    skills: [
      {
        user_skill_id: 997,
        skill_id: 10,
        skill_name: "Python",
        category_name: "Backend",
        level: 4,
      },
    ],
  },
];

const baseProps = {
  rows,
  renderedCoverage: coverage,
  totalGridRows: 4,
  firstBodyRowIndex: 3,
  focusedCell: { row: 0, col: 0 },
  onFocusedCellChange: vi.fn(),
  onRate: vi.fn(),
};

describe("SkillsHeatmapGrid", () => {
  it("renders a grid with aria-label containing 'heatmap'", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const grid = screen.getByRole("grid");
    // aria-label is on the scroll container (parent of the grid div)
    const scrollContainer = grid.parentElement;
    expect(scrollContainer?.getAttribute("aria-label")).toMatch(/heatmap/i);
  });

  it("renders color-only cells without L{n} text", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python L3/i });
    // No L{n} text content — color-only
    expect(cell.textContent).not.toMatch(/L\d/);
  });

  it("uses levelHeat softer color class on rated cells (not levelDot solid or levelColor 15%)", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python L3/i });
    // levelHeat(3) = "bg-amber-400/80 ... ring-1 ring-inset ring-amber-500/30"
    expect(cell.className).toContain("bg-amber-400/80");
    expect(cell.className).toContain("ring-1");
    // NOT the solid dot (bg-amber-500 without /80) or the 15% opacity tint
    expect(cell.className).not.toMatch(/bg-amber-500(?!\/)/);
    expect(cell.className).not.toContain("/15");
  });

  it("renders cells as div[role=gridcell] containing a button", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const cellButton = screen.getByRole("button", { name: /alice Python L3/i });
    const gridcell = cellButton.parentElement;
    expect(gridcell?.getAttribute("role")).toBe("gridcell");
  });

  it("positions column 0 at left 0px", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const cellButton = screen.getByRole("button", { name: /alice Python L3/i });
    expect(cellButton.parentElement?.parentElement?.style.left).toBe("0px");
  });

  it("positions each virtual column at index * skillColWidth (not stale virtualItem.start)", () => {
    // Regression: the virtualizer caches the initial 64px estimate and doesn't
    // recompute when skillColWidth changes. The mock returns start values with
    // 100px spacing to simulate this stale cache. The component must compute
    // left from index * skillColWidth (80 in jsdom after min-width clamp),
    // NOT virtualItem.start.
    render(<SkillsHeatmapGrid {...baseProps} />);
    // Column 1 (React) — alice has a rating. left should be 1 * 80 = 80px,
    // NOT 100px (the stale virtualItem.start spacing).
    const col1Button = screen.getByRole("button", { name: /alice React L2/i });
    expect(col1Button.parentElement?.parentElement?.style.left).toBe("80px");
  });

  it("calls virtualizer.measure to invalidate stale size cache", () => {
    mocks.measure.mockClear();
    render(<SkillsHeatmapGrid {...baseProps} />);
    expect(mocks.measure).toHaveBeenCalled();
  });

  it("renders aria-label with member, skill, and level on rated cells", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    expect(screen.getByRole("button", { name: /alice Python L3/i })).toBeInTheDocument();
  });

  it("renders title tooltip with levelLabel on rated cells", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python L3/i });
    expect(cell.getAttribute("title")).toContain("Proficient");
  });

  it("renders unrated cells with muted swatch and 'no rating' label", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    expect(screen.getByRole("button", { name: /bob React.*no rating/i })).toBeInTheDocument();
  });

  it("renders row wrappers with role=row and aria-rowindex", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const grid = screen.getByRole("grid");
    const rowEls = grid.querySelectorAll('[role="row"]');
    expect(rowEls.length).toBeGreaterThanOrEqual(2);
    expect(rowEls[0].getAttribute("aria-rowindex")).toBeTruthy();
  });

  it("renders grid with aria-rowcount", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-rowcount")).toBe("4");
  });

  it("renders grid with aria-colcount = skills + member column", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-colcount")).toBe("3");
  });

  it("gives every skill cell explicit aria-rowindex and aria-colindex", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    // alice is row 0 → aria-rowindex = firstBodyRowIndex(3) + 0 = 3.
    // Python is col 0 → aria-colindex = 0 + 2 = 2 (col 1 = member).
    const cellButton = screen.getByRole("button", { name: /alice Python L3/i });
    const gridcell = cellButton.parentElement;
    expect(gridcell?.getAttribute("aria-rowindex")).toBe("3");
    expect(gridcell?.getAttribute("aria-colindex")).toBe("2");
    // bob is row 1 → aria-rowindex 4; Python is col 0 → aria-colindex 2.
    const bobButton = screen.getByRole("button", { name: /bob Python L4/i });
    const bobCell = bobButton.parentElement;
    expect(bobCell?.getAttribute("aria-rowindex")).toBe("4");
    expect(bobCell?.getAttribute("aria-colindex")).toBe("2");
  });

  it("gives unrated cells explicit aria-rowindex and aria-colindex", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    // bob has no React rating (row 1, col 1).
    const unratedButton = screen.getByRole("button", { name: /bob React.*no rating/i });
    const gridcell = unratedButton.parentElement;
    expect(gridcell?.getAttribute("aria-rowindex")).toBe("4");
    expect(gridcell?.getAttribute("aria-colindex")).toBe("3");
  });

  it("renders skill sub-headers as columnheader with aria-colindex", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    // Both the header div and its inner truncate div carry title="Python";
    // the outer element is the columnheader.
    const pythonHeader = screen.getAllByTitle("Python")[0];
    expect(pythonHeader.getAttribute("role")).toBe("columnheader");
    expect(pythonHeader.getAttribute("aria-colindex")).toBe("2");
  });

  it("renders member rows with a rowheader for the name", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const row = screen.getByText("alice").closest('[role="row"]');
    expect(row).not.toBeNull();
    const rowheader = row?.querySelector('[role="rowheader"]');
    // Member cell shows the compact gradient avatar ("A") + username.
    expect(rowheader?.textContent).toContain("alice");
    expect(rowheader?.getAttribute("aria-colindex")).toBe("1");
  });

  it("separates rows with border-t on member rows and gridcells", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const memberRow = screen.getByText("alice").closest('[role="row"]');
    expect(memberRow?.className).toContain("border-t");
    const cellButton = screen.getByRole("button", { name: /alice Python L3/i });
    expect(cellButton.parentElement?.className).toContain("border-t");
  });

  it("renders category super-headers as text labels", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Frontend")).toBeInTheDocument();
  });

  it("renders skill sub-headers with truncate + title", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const pythonHeader = screen.getByText("Python");
    expect(pythonHeader.getAttribute("title")).toBe("Python");
  });

  it("renders coverage (Avg) below skill sub-headers", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    expect(screen.getByText((_, el) => el?.textContent === "Avg 3.5")).toBeInTheDocument();
  });

  it("opens rate dialog on Enter for a rated cell", () => {
    const onRate = vi.fn();
    render(<SkillsHeatmapGrid {...baseProps} onRate={onRate} />);
    const cell = screen.getByRole("button", { name: /alice Python L3/i });
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onRate).toHaveBeenCalledWith({
      userSkillId: 999,
      username: "alice",
      skillName: "Python",
      currentLevel: 3,
    });
  });

  it("does not open rate dialog on Enter for an unrated cell", () => {
    const onRate = vi.fn();
    render(<SkillsHeatmapGrid {...baseProps} onRate={onRate} />);
    const cell = screen.getByRole("button", { name: /bob React.*no rating/i });
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onRate).not.toHaveBeenCalled();
  });

  it("opens rate dialog on click for a rated cell", () => {
    const onRate = vi.fn();
    render(<SkillsHeatmapGrid {...baseProps} onRate={onRate} />);
    fireEvent.click(screen.getByRole("button", { name: /alice Python L3/i }));
    expect(onRate).toHaveBeenCalledWith({
      userSkillId: 999,
      username: "alice",
      skillName: "Python",
      currentLevel: 3,
    });
  });

  it("focuses only (no rate dialog) on click for an unrated cell", () => {
    const onRate = vi.fn();
    const onFocusedCellChange = vi.fn();
    render(
      <SkillsHeatmapGrid {...baseProps} onRate={onRate} onFocusedCellChange={onFocusedCellChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: /bob React.*no rating/i }));
    expect(onFocusedCellChange).toHaveBeenCalled();
    expect(onRate).not.toHaveBeenCalled();
  });

  it("moves focused cell on ArrowDown", () => {
    const onFocusedCellChange = vi.fn();
    render(<SkillsHeatmapGrid {...baseProps} onFocusedCellChange={onFocusedCellChange} />);
    const cell = screen.getByRole("button", { name: /alice Python L3/i });
    fireEvent.keyDown(cell, { key: "ArrowDown" });
    expect(onFocusedCellChange).toHaveBeenCalledWith({ row: 1, col: 0 });
  });

  it("keeps only the focused cell tabbable", () => {
    render(<SkillsHeatmapGrid {...baseProps} focusedCell={{ row: 0, col: 0 }} />);
    const alicePython = screen.getByRole("button", { name: /alice Python L3/i });
    const aliceReact = screen.getByRole("button", { name: /alice React L2/i });
    expect(alicePython.getAttribute("tabindex")).toBe("0");
    expect(aliceReact.getAttribute("tabindex")).toBe("-1");
  });

  it("renders scroll container with skills-scroll class (styled scrollbar)", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const grid = screen.getByRole("grid");
    const scrollContainer = grid.closest("[class*='skills-scroll']");
    expect(scrollContainer).not.toBeNull();
  });

  it("keeps the heatmap surface at least as wide as its viewport", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const grid = screen.getByRole("grid");
    expect(grid.style.minWidth).toBe("100%");
  });

  it("renders 'Member' header in the sticky member column", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("renders member names in the sticky member column", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("delegates the legend to the shared page-level SkillsLevelLegend", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    // The inline legend was removed — the shared SkillsLevelLegend renders
    // once on the Team page for all view modes.
    expect(screen.queryByText("Proficiency")).not.toBeInTheDocument();
  });

  it("renders cells with rounded-sm class", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python L3/i });
    expect(cell.className).toContain("rounded-sm");
  });

  it("renders unrated cells with dashed border", () => {
    render(<SkillsHeatmapGrid {...baseProps} />);
    const cell = screen.getByRole("button", { name: /bob React.*no rating/i });
    expect(cell.className).toContain("border-dashed");
  });
});
