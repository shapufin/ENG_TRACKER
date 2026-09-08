import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsMemberColumn } from "./SkillsMemberColumn";
import type { TeamMatrixRow } from "../types/skills";

const rows: TeamMatrixRow[] = [
  { user_id: 100, username: "alice", full_name: "Alice Aardvark", skills: [] },
  { user_id: 200, username: "bob", skills: [] },
];

const baseProps = {
  rows,
  firstBodyRowIndex: 3,
  hoveredRow: null as number | null,
  onHoverRow: vi.fn(),
};

describe("SkillsMemberColumn", () => {
  it("renders a sticky w-44 column with a rowheader per member", () => {
    const { container } = render(<SkillsMemberColumn {...baseProps} />);
    const column = container.firstElementChild as HTMLElement;
    expect(column.className).toContain("w-44");
    expect(column.className).toContain("sticky");
    const rowheaders = screen.getAllByRole("rowheader");
    expect(rowheaders).toHaveLength(2);
    expect(rowheaders[0].getAttribute("aria-colindex")).toBe("1");
    expect(rowheaders[0].textContent).toContain("Alice Aardvark");
  });

  it("renders rows with aria-rowindex offset by firstBodyRowIndex", () => {
    render(<SkillsMemberColumn {...baseProps} />);
    const rowEls = screen.getAllByRole("row");
    expect(rowEls[0].getAttribute("aria-rowindex")).toBe("3");
    expect(rowEls[1].getAttribute("aria-rowindex")).toBe("4");
  });

  it("highlights the hovered row and reports hover changes", () => {
    const onHoverRow = vi.fn();
    const { rerender } = render(
      <SkillsMemberColumn {...baseProps} hoveredRow={1} onHoverRow={onHoverRow} />
    );
    const rowEls = screen.getAllByRole("row");
    expect(rowEls[1].className).toContain("bg-foreground/5");
    expect(rowEls[0].className).not.toContain("bg-foreground/5");
    // Mouse enter/leave delegate to the onHoverRow callback.
    fireEvent.mouseEnter(rowEls[0]);
    expect(onHoverRow).toHaveBeenCalledWith(0);
    fireEvent.mouseLeave(rowEls[0]);
    expect(onHoverRow).toHaveBeenCalledWith(null);
  });
});
