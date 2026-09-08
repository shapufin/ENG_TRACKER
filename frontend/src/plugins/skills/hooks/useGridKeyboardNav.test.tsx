import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useRef } from "react";
import { useGridKeyboardNav } from "./useGridKeyboardNav";

/** Test wrapper that provides a real scrollRef with queryable DOM cells. */
function TestGrid({
  maxRow,
  maxCol,
  focusedCell,
  onFocusedCellChange,
  onActivate,
  scrollToIndex,
  cells,
}: {
  maxRow: number;
  maxCol: number;
  focusedCell: { row: number; col: number };
  onFocusedCellChange: (cell: { row: number; col: number }) => void;
  onActivate: (row: number, col: number) => void;
  scrollToIndex?: (index: number, options?: { align?: "start" | "center" | "end" }) => void;
  cells: Array<{ row: number; col: number }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { handleCellKeyDown } = useGridKeyboardNav({
    maxRow,
    maxCol,
    focusedCell,
    onFocusedCellChange,
    onActivate,
    scrollRef,
    scrollToIndex,
  });
  return (
    <div ref={scrollRef}>
      {cells.map((c) => (
        <button
          key={`${c.row}-${c.col}`}
          data-row={c.row}
          data-col={c.col}
          onKeyDown={(e) => handleCellKeyDown(e, c.row, c.col)}
        >
          {c.row}-{c.col}
        </button>
      ))}
    </div>
  );
}

describe("useGridKeyboardNav", () => {
  it("moves focusedCell down on ArrowDown within bounds", () => {
    const onFocusedCellChange = vi.fn();
    render(
      <TestGrid
        maxRow={2}
        maxCol={2}
        focusedCell={{ row: 0, col: 0 }}
        onFocusedCellChange={onFocusedCellChange}
        onActivate={vi.fn()}
        cells={[
          { row: 0, col: 0 },
          { row: 1, col: 0 },
        ]}
      />
    );
    const cell = screen.getByText("0-0");
    fireEvent.keyDown(cell, { key: "ArrowDown" });
    expect(onFocusedCellChange).toHaveBeenCalledWith({ row: 1, col: 0 });
  });

  it("moves focusedCell right on ArrowRight within bounds", () => {
    const onFocusedCellChange = vi.fn();
    render(
      <TestGrid
        maxRow={2}
        maxCol={2}
        focusedCell={{ row: 0, col: 0 }}
        onFocusedCellChange={onFocusedCellChange}
        onActivate={vi.fn()}
        cells={[
          { row: 0, col: 0 },
          { row: 0, col: 1 },
        ]}
      />
    );
    const cell = screen.getByText("0-0");
    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(onFocusedCellChange).toHaveBeenCalledWith({ row: 0, col: 1 });
  });

  it("does not move past maxRow on ArrowDown (no-op)", () => {
    const onFocusedCellChange = vi.fn();
    render(
      <TestGrid
        maxRow={1}
        maxCol={1}
        focusedCell={{ row: 1, col: 0 }}
        onFocusedCellChange={onFocusedCellChange}
        onActivate={vi.fn()}
        cells={[{ row: 1, col: 0 }]}
      />
    );
    const cell = screen.getByText("1-0");
    fireEvent.keyDown(cell, { key: "ArrowDown" });
    expect(onFocusedCellChange).not.toHaveBeenCalled();
  });

  it("does not move past maxCol on ArrowRight (no-op)", () => {
    const onFocusedCellChange = vi.fn();
    render(
      <TestGrid
        maxRow={1}
        maxCol={1}
        focusedCell={{ row: 0, col: 1 }}
        onFocusedCellChange={onFocusedCellChange}
        onActivate={vi.fn()}
        cells={[{ row: 0, col: 1 }]}
      />
    );
    const cell = screen.getByText("0-1");
    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(onFocusedCellChange).not.toHaveBeenCalled();
  });

  it("does not move below 0 on ArrowUp (no-op)", () => {
    const onFocusedCellChange = vi.fn();
    render(
      <TestGrid
        maxRow={1}
        maxCol={1}
        focusedCell={{ row: 0, col: 0 }}
        onFocusedCellChange={onFocusedCellChange}
        onActivate={vi.fn()}
        cells={[{ row: 0, col: 0 }]}
      />
    );
    const cell = screen.getByText("0-0");
    fireEvent.keyDown(cell, { key: "ArrowUp" });
    expect(onFocusedCellChange).not.toHaveBeenCalled();
  });

  it("calls onActivate on Enter", () => {
    const onActivate = vi.fn();
    render(
      <TestGrid
        maxRow={1}
        maxCol={1}
        focusedCell={{ row: 0, col: 0 }}
        onFocusedCellChange={vi.fn()}
        onActivate={onActivate}
        cells={[{ row: 0, col: 0 }]}
      />
    );
    const cell = screen.getByText("0-0");
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith(0, 0);
  });

  it("clamps effectiveFocusedCell when focusedCell.row exceeds maxRow", () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        maxRow: 2,
        maxCol: 2,
        focusedCell: { row: 10, col: 0 },
        onFocusedCellChange: vi.fn(),
        onActivate: vi.fn(),
        scrollRef: { current: null },
      })
    );
    expect(result.current.effectiveFocusedCell.row).toBe(2);
  });

  it("clamps effectiveFocusedCell when focusedCell.col exceeds maxCol", () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        maxRow: 2,
        maxCol: 2,
        focusedCell: { row: 0, col: 10 },
        onFocusedCellChange: vi.fn(),
        onActivate: vi.fn(),
        scrollRef: { current: null },
      })
    );
    expect(result.current.effectiveFocusedCell.col).toBe(2);
  });

  it("calls scrollToIndex when querySelector returns null (virtualized-out column)", () => {
    const onFocusedCellChange = vi.fn();
    const scrollToIndex = vi.fn();
    // Render only cell 0-0, but arrow-right to col 1 which is NOT in the DOM
    render(
      <TestGrid
        maxRow={1}
        maxCol={5}
        focusedCell={{ row: 0, col: 0 }}
        onFocusedCellChange={onFocusedCellChange}
        onActivate={vi.fn()}
        scrollToIndex={scrollToIndex}
        cells={[{ row: 0, col: 0 }]}
      />
    );
    const cell = screen.getByText("0-0");
    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(onFocusedCellChange).toHaveBeenCalledWith({ row: 0, col: 1 });
    expect(scrollToIndex).toHaveBeenCalledWith(1, { align: "center" });
  });

  it("does not call scrollToIndex when target cell IS in the DOM", () => {
    const onFocusedCellChange = vi.fn();
    const scrollToIndex = vi.fn();
    render(
      <TestGrid
        maxRow={1}
        maxCol={1}
        focusedCell={{ row: 0, col: 0 }}
        onFocusedCellChange={onFocusedCellChange}
        onActivate={vi.fn()}
        scrollToIndex={scrollToIndex}
        cells={[
          { row: 0, col: 0 },
          { row: 0, col: 1 },
        ]}
      />
    );
    const cell = screen.getByText("0-0");
    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(scrollToIndex).not.toHaveBeenCalled();
  });
});
