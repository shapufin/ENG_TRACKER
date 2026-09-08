import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsDenseMatrix } from "./SkillsDenseMatrix";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  }
);

// Shared mock for virtualizer.measure — vi.hoisted so it's available inside
// the hoisted vi.mock factory. The mock returns `start` values with 100px
// spacing to simulate a STALE virtualizer size cache (the real bug: the
// virtualizer caches the initial 64px estimate and doesn't recompute when
// skillColWidth changes). The component must compute `left` from
// `index * skillColWidth`, NOT from `virtualItem.start`, so columns don't
// overlap.
const mocks = vi.hoisted(() => ({
  measure: vi.fn(),
}));

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

describe("SkillsDenseMatrix", () => {
  beforeEach(() => {
    mocks.measure.mockClear();
  });

  it("renders a grid with aria-label containing 'dense matrix'", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const grid = screen.getByRole("grid");
    const scrollContainer = grid.parentElement;
    expect(scrollContainer?.getAttribute("aria-label")).toMatch(/dense matrix/i);
  });

  it("renders an empty grid without crashing when rows and coverage are empty", () => {
    render(<SkillsDenseMatrix {...baseProps} rows={[]} renderedCoverage={[]} totalGridRows={2} />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("renders L{level} text cells (NOT color-only)", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
    expect(cell.textContent).toMatch(/L3/);
  });

  it("uses levelColor() paired text color on rated cells (not levelHeat white text)", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
    // levelColor(3) = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40"
    expect(cell.className).toContain("bg-amber-500/15");
    expect(cell.className).toContain("text-amber-700");
    expect(cell.className).toContain("border-amber-500/40");
    // NOT the heatmap levelHeat pattern (80% opacity + ring)
    expect(cell.className).not.toContain("/80");
    expect(cell.className).not.toContain("ring-1");
  });

  it("does NOT use border-transparent on rated cells (levelColor supplies border color)", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
    // levelColor() supplies border-amber-500/40 — combining with
    // border-transparent would create an ambiguous cascade.
    expect(cell.className).not.toContain("border-transparent");
  });

  it("renders title tooltip with levelLabel on rated cells", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
    expect(cell.getAttribute("title")).toContain("Proficient");
  });

  it("renders cells as div[role=gridcell] containing a button", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cellButton = screen.getByRole("button", { name: /alice Python.*L3/i });
    const gridcell = cellButton.parentElement;
    expect(gridcell?.getAttribute("role")).toBe("gridcell");
  });

  it("positions column 0 at left 0px", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cellButton = screen.getByRole("button", { name: /alice Python.*L3/i });
    expect(cellButton.parentElement?.parentElement?.style.left).toBe("0px");
  });

  it("positions each virtual column at index * skillColWidth (not stale virtualItem.start)", () => {
    // Regression: the virtualizer caches the initial 64px estimate and doesn't
    // recompute when skillColWidth changes. The mock returns start values with
    // 100px spacing to simulate this stale cache. The component must compute
    // left from index * skillColWidth (80 in jsdom after min-width clamp),
    // NOT virtualItem.start.
    render(<SkillsDenseMatrix {...baseProps} />);
    // Column 1 (React) — alice has a rating. left should be 1 * 80 = 80px,
    // NOT 100px (the stale virtualItem.start spacing).
    const col1Button = screen.getByRole("button", { name: /alice React.*L2/i });
    expect(col1Button.parentElement?.parentElement?.style.left).toBe("80px");
  });

  it("calls virtualizer.measure to invalidate stale size cache", () => {
    mocks.measure.mockClear();
    render(<SkillsDenseMatrix {...baseProps} />);
    expect(mocks.measure).toHaveBeenCalled();
  });

  it("renders aria-label with member, skill, and level on rated cells", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    expect(screen.getByRole("button", { name: /alice Python.*L3/i })).toBeInTheDocument();
  });

  it("renders unrated cells as hollow dots with 'no rating' label", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const unratedButton = screen.getByRole("button", { name: /bob React.*no rating/i });
    expect(unratedButton).toBeInTheDocument();
    // Unrated cells render a hollow dot (same as Matrix mode), not an em dash.
    const dot = unratedButton.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass("rounded-full");
  });

  it("renders unrated cells with border-transparent (keeps 1px footprint)", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const unratedButton = screen.getByRole("button", { name: /bob React.*no rating/i });
    expect(unratedButton.className).toContain("border-transparent");
  });

  it("renders row wrappers with role=row and aria-rowindex", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const grid = screen.getByRole("grid");
    const rowEls = grid.querySelectorAll('[role="row"]');
    expect(rowEls.length).toBeGreaterThanOrEqual(2);
    expect(rowEls[0].getAttribute("aria-rowindex")).toBeTruthy();
  });

  it("renders grid with aria-rowcount", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-rowcount")).toBe("4");
  });

  it("renders grid with aria-colcount = skills + member column", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-colcount")).toBe("3");
  });

  it("gives every skill cell explicit aria-rowindex and aria-colindex", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    // alice is row 0 → aria-rowindex = firstBodyRowIndex(3) + 0 = 3.
    // Python is col 0 → aria-colindex = 0 + 2 = 2 (col 1 = member).
    const cellButton = screen.getByRole("button", { name: /alice Python.*L3/i });
    const gridcell = cellButton.parentElement;
    expect(gridcell?.getAttribute("aria-rowindex")).toBe("3");
    expect(gridcell?.getAttribute("aria-colindex")).toBe("2");
    // bob is row 1 → aria-rowindex 4; Python is col 0 → aria-colindex 2.
    const bobButton = screen.getByRole("button", { name: /bob Python.*L4/i });
    const bobCell = bobButton.parentElement;
    expect(bobCell?.getAttribute("aria-rowindex")).toBe("4");
    expect(bobCell?.getAttribute("aria-colindex")).toBe("2");
  });

  it("gives unrated cells explicit aria-rowindex and aria-colindex", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    // bob has no React rating (row 1, col 1).
    const unratedButton = screen.getByRole("button", { name: /bob React.*no rating/i });
    const gridcell = unratedButton.parentElement;
    expect(gridcell?.getAttribute("aria-rowindex")).toBe("4");
    expect(gridcell?.getAttribute("aria-colindex")).toBe("3");
  });

  it("renders skill sub-headers as columnheader with aria-colindex", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const pythonHeader = screen.getAllByTitle("Python")[0];
    expect(pythonHeader.getAttribute("role")).toBe("columnheader");
    expect(pythonHeader.getAttribute("aria-colindex")).toBe("2");
  });

  it("renders member rows with a rowheader for the name", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const row = screen.getByText("alice").closest('[role="row"]');
    expect(row).not.toBeNull();
    const rowheader = row?.querySelector('[role="rowheader"]');
    // Member cell shows the initials avatar ("A") + username.
    expect(rowheader?.textContent).toContain("alice");
    expect(rowheader?.getAttribute("aria-colindex")).toBe("1");
  });

  it("renders category super-headers as text labels", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Frontend")).toBeInTheDocument();
  });

  it("renders skill sub-headers with truncate + title", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const pythonHeader = screen.getByText("Python");
    expect(pythonHeader.getAttribute("title")).toBe("Python");
  });

  it("renders coverage (Avg) below skill sub-headers", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const avgLabels = screen.getAllByText("Avg");
    expect(avgLabels.length).toBeGreaterThanOrEqual(1);
    expect(avgLabels[0].parentElement).toHaveTextContent(/3\.5|2/);
  });

  it("renders rated cells as hybrid tick bar + L number", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
    // 5 tick segments, 3 filled for L3.
    const segments = cell.querySelectorAll("span[aria-hidden='true'] > span");
    expect(segments).toHaveLength(5);
    // The L number label is present alongside the bar.
    expect(cell.textContent).toContain("L3");
  });

  it("applies category accent classes to super-headers", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const backend = screen.getByText("Backend");
    expect(backend.className).toMatch(/text-\w+-700 dark:text-\w+-400/);
    // Accent is carried by text + left border on the neutral bg-muted strip
    // (no tinted accent background on header cells).
    expect(backend.className).toMatch(/border-l-\w+-500\/30/);
    expect(backend.className).toContain("bg-muted");
    expect(backend.className).not.toMatch(/bg-\w+-500\/5/);
  });

  it("opens rate dialog on Enter for a rated cell", () => {
    const onRate = vi.fn();
    render(<SkillsDenseMatrix {...baseProps} onRate={onRate} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
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
    render(<SkillsDenseMatrix {...baseProps} onRate={onRate} />);
    const cell = screen.getByRole("button", { name: /bob React.*no rating/i });
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onRate).not.toHaveBeenCalled();
  });

  it("opens rate dialog on click for a rated cell", () => {
    const onRate = vi.fn();
    render(<SkillsDenseMatrix {...baseProps} onRate={onRate} />);
    fireEvent.click(screen.getByRole("button", { name: /alice Python.*L3/i }));
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
      <SkillsDenseMatrix {...baseProps} onRate={onRate} onFocusedCellChange={onFocusedCellChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: /bob React.*no rating/i }));
    expect(onFocusedCellChange).toHaveBeenCalled();
    expect(onRate).not.toHaveBeenCalled();
  });

  it("moves focused cell on ArrowDown", () => {
    const onFocusedCellChange = vi.fn();
    render(<SkillsDenseMatrix {...baseProps} onFocusedCellChange={onFocusedCellChange} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
    fireEvent.keyDown(cell, { key: "ArrowDown" });
    expect(onFocusedCellChange).toHaveBeenCalledWith({ row: 1, col: 0 });
  });

  it("moves focused cell on ArrowRight", () => {
    const onFocusedCellChange = vi.fn();
    render(<SkillsDenseMatrix {...baseProps} onFocusedCellChange={onFocusedCellChange} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(onFocusedCellChange).toHaveBeenCalledWith({ row: 0, col: 1 });
  });

  it("keeps only the focused cell tabbable", () => {
    render(<SkillsDenseMatrix {...baseProps} focusedCell={{ row: 0, col: 0 }} />);
    const alicePython = screen.getByRole("button", { name: /alice Python.*L3/i });
    const aliceReact = screen.getByRole("button", { name: /alice React.*L2/i });
    expect(alicePython.getAttribute("tabindex")).toBe("0");
    expect(aliceReact.getAttribute("tabindex")).toBe("-1");
  });

  it("renders scroll container with skills-scroll class (styled scrollbar)", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const grid = screen.getByRole("grid");
    const scrollContainer = grid.closest("[class*='skills-scroll']");
    expect(scrollContainer).not.toBeNull();
  });

  it("keeps the dense surface at least as wide as its viewport", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const grid = screen.getByRole("grid");
    expect(grid.style.minWidth).toBe("100%");
  });

  it("renders 'Member' header in the sticky member column", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("renders member names in the sticky member column", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("does NOT render a proficiency legend (text labels provide structure)", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    expect(screen.queryByText("Proficiency")).not.toBeInTheDocument();
    expect(screen.queryByText("Not rated")).not.toBeInTheDocument();
  });

  it("renders cells with rounded-sm class", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
    expect(cell.className).toContain("rounded-sm");
  });

  it("does NOT use hover:scale-105 (heatmap-specific visual feedback)", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cell = screen.getByRole("button", { name: /alice Python.*L3/i });
    expect(cell.className).not.toContain("hover:scale-105");
  });

  it("does NOT apply row/col hover highlighting (no hoveredRow/hoveredCol state)", () => {
    render(<SkillsDenseMatrix {...baseProps} />);
    const cellButton = screen.getByRole("button", { name: /alice Python.*L3/i });
    const gridcell = cellButton.parentElement;
    // The heatmap uses HOVER_HIGHLIGHT = "bg-foreground/5 dark:bg-foreground/10"
    // on cells. Dense should not include this conditional class.
    expect(gridcell?.className).not.toContain("bg-foreground/5");
  });
});
