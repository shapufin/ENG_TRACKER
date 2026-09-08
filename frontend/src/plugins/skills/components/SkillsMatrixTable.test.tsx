import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsMatrixTable } from "./SkillsMatrixTable";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  }
);

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

describe("SkillsMatrixTable", () => {
  it("renders a grid with the correct aria-rowcount", () => {
    render(<SkillsMatrixTable {...baseProps} />);

    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-rowcount")).toBe("4");
  });

  it("renders category super-headers and skill sub-headers with coverage", () => {
    render(<SkillsMatrixTable {...baseProps} />);

    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    // Avg value is color-toned in its own span next to the "Avg" label.
    const avgLabels = screen.getAllByText("Avg");
    expect(avgLabels).toHaveLength(2);
    for (const label of avgLabels) {
      expect(label.parentElement).toHaveTextContent(/3\.5|2/);
    }
  });

  it("renders the member profile cell with avatar and display name", () => {
    render(
      <SkillsMatrixTable
        {...baseProps}
        rows={[
          {
            user_id: 100,
            username: "alice",
            full_name: "Alice Aardvark",
            skills: rows[0].skills,
          },
        ]}
      />
    );
    expect(screen.getByText("Alice Aardvark")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
  });

  it("falls back to the username when full_name is absent", () => {
    render(<SkillsMatrixTable {...baseProps} />);
    // No @username subtitle when display name === username.
    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
    expect(screen.getAllByText("alice").length).toBeGreaterThan(0);
  });

  it("renders unrated cells as hollow dots (not plain em dashes)", () => {
    render(<SkillsMatrixTable {...baseProps} />);
    const unrated = screen.getByRole("button", {
      name: /bob React — no rating/i,
    });
    const dot = unrated.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass("rounded-full");
  });

  it("applies category accent classes to super-headers", () => {
    render(<SkillsMatrixTable {...baseProps} />);
    const backend = screen.getByText("Backend").closest("th");
    expect(backend?.className).toMatch(/text-\w+-700 dark:text-\w+-400/);
    // Accent is carried by text + left border on the neutral bg-muted strip
    // (no tinted accent background on header cells).
    expect(backend?.className).toMatch(/border-l-\w+-500\/30/);
    expect(backend?.className).toContain("bg-muted");
    expect(backend?.className).not.toMatch(/bg-\w+-500\/5/);
  });

  it("renders rated cells with level buttons", () => {
    render(<SkillsMatrixTable {...baseProps} />);

    expect(screen.getByRole("button", { name: /alice Python L3/i })).toBeInTheDocument();
  });

  it("renders unrated cells as focusable placeholders", () => {
    render(<SkillsMatrixTable {...baseProps} />);

    expect(screen.getByRole("button", { name: /bob React.*no rating/i })).toBeInTheDocument();
  });

  it("opens the rate dialog via Enter key on a rated cell", () => {
    const onRate = vi.fn();
    render(<SkillsMatrixTable {...baseProps} onRate={onRate} />);

    const aliceCell = screen.getByRole("button", { name: /alice Python L3/i });
    fireEvent.keyDown(aliceCell, { key: "Enter" });

    expect(onRate).toHaveBeenCalledWith({
      userSkillId: 999,
      username: "alice",
      skillName: "Python",
      currentLevel: 3,
    });
  });

  it("does not open the rate dialog on Enter for an unrated cell", () => {
    const onRate = vi.fn();
    render(<SkillsMatrixTable {...baseProps} onRate={onRate} />);

    const unratedCell = screen.getByRole("button", { name: /bob React.*no rating/i });
    fireEvent.keyDown(unratedCell, { key: "Enter" });

    expect(onRate).not.toHaveBeenCalled();
  });

  it("moves focus down on ArrowDown and updates focused cell state", () => {
    const onFocusedCellChange = vi.fn();
    render(<SkillsMatrixTable {...baseProps} onFocusedCellChange={onFocusedCellChange} />);

    const aliceCell = screen.getByRole("button", { name: /alice Python L3/i });
    fireEvent.keyDown(aliceCell, { key: "ArrowDown" });

    expect(onFocusedCellChange).toHaveBeenCalledWith({ row: 1, col: 0 });
  });

  it("moves focus right on ArrowRight", () => {
    const onFocusedCellChange = vi.fn();
    render(<SkillsMatrixTable {...baseProps} onFocusedCellChange={onFocusedCellChange} />);

    const alicePython = screen.getByRole("button", { name: /alice Python L3/i });
    fireEvent.keyDown(alicePython, { key: "ArrowRight" });

    expect(onFocusedCellChange).toHaveBeenCalledWith({ row: 0, col: 1 });
  });

  it("calls onRate when a rated cell is clicked", () => {
    const onRate = vi.fn();
    render(<SkillsMatrixTable {...baseProps} onRate={onRate} />);

    fireEvent.click(screen.getByRole("button", { name: /alice Python L3/i }));

    expect(onRate).toHaveBeenCalledWith({
      userSkillId: 999,
      username: "alice",
      skillName: "Python",
      currentLevel: 3,
    });
  });

  it("keeps only the focused cell tabbable", () => {
    render(<SkillsMatrixTable {...baseProps} focusedCell={{ row: 0, col: 0 }} />);

    const alicePython = screen.getByRole("button", { name: /alice Python L3/i });
    const aliceReact = screen.getByRole("button", { name: /alice React L2/i });

    expect(alicePython.getAttribute("tabindex")).toBe("0");
    expect(aliceReact.getAttribute("tabindex")).toBe("-1");
  });
});
