/**
 * TeamMultiSelect tests — hierarchy rendering + selection contract.
 *
 * Verifies:
 * - Root teams and sub-teams render with indentation.
 * - Sub-team appears nested under its parent.
 * - Search filters across all levels.
 * - Selection still works (toggle, clear, chips).
 * - Partial team objects (no parent_team_id) render as roots (backward compat).
 * - onChange contract unchanged (number[]).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TeamMultiSelect } from "./TeamMultiSelect";

const flatTeams = [
  { id: 1, name: "Team A", code: "A" },
  { id: 2, name: "Team B", code: "B" },
  { id: 3, name: "Team C", code: "C" },
];

const hierarchicalTeams = [
  { id: 1, name: "Albanian Operations", code: "AL_OPS", parent_team: null },
  { id: 2, name: "Infrastructure", code: "INFRA", parent_team: 1 },
  { id: 3, name: "Backup", code: "BACKUP", parent_team: 1 },
  { id: 4, name: "Database", code: "DB", parent_team: 1 },
  { id: 5, name: "Standalone Team", code: "STAND", parent_team: null },
];

describe("TeamMultiSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("flat teams (backward compatibility)", () => {
    it("renders all teams when no hierarchy data is present", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={flatTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("Team A")).toBeInTheDocument();
      expect(screen.getByText("Team B")).toBeInTheDocument();
      expect(screen.getByText("Team C")).toBeInTheDocument();
    });

    it("calls onChange with number[] when a team is toggled", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={flatTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      fireEvent.click(screen.getByText("Team A"));

      expect(onChange).toHaveBeenCalledWith([1]);
    });

    it("selected chips use text-foreground, not text-primary (same failing tint pair as nav)", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={flatTeams} value={[1]} onChange={onChange} />);

      const chip = screen.getByText("Team A").closest("span");
      expect(chip?.className).toContain("text-foreground");
      expect(chip?.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
      const remove = screen.getByRole("button", { name: "Remove Team A" });
      expect(remove.className).toContain("text-foreground");
    });
  });

  describe("hierarchical teams", () => {
    it("renders root teams and sub-teams with indentation", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={hierarchicalTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));

      // Root teams should be visible
      expect(screen.getByText("Albanian Operations")).toBeInTheDocument();
      expect(screen.getByText("Standalone Team")).toBeInTheDocument();
      // Sub-teams should be visible
      expect(screen.getByText("Infrastructure")).toBeInTheDocument();
      expect(screen.getByText("Backup")).toBeInTheDocument();
      expect(screen.getByText("Database")).toBeInTheDocument();
    });

    it("indents sub-teams under their parent", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={hierarchicalTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));

      // Options render in a portal — use screen (queries document.body).
      const options = screen.getAllByRole("option");
      expect(options.length).toBe(5);

      // Find the Infrastructure option (a sub-team)
      const infraOption = options.find((el) => el.textContent?.includes("Infrastructure"));
      const rootOption = options.find((el) => el.textContent?.includes("Albanian Operations"));

      expect(infraOption).toBeDefined();
      expect(rootOption).toBeDefined();

      // Sub-team should have more indentation (pl-4 or higher) than root (pl-2 or pl-0)
      const infraPadding = infraOption!.className.match(/pl-(\d+)/);
      const rootPadding = rootOption!.className.match(/pl-(\d+)/);
      const infraVal = infraPadding ? parseInt(infraPadding[1]) : 0;
      const rootVal = rootPadding ? parseInt(rootPadding[1]) : 0;
      expect(infraVal).toBeGreaterThan(rootVal);
    });

    it("search filters across all levels", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={hierarchicalTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      const input = screen.getByPlaceholderText("Filter teams...");
      fireEvent.change(input, { target: { value: "infra" } });

      expect(screen.getByText("Infrastructure")).toBeInTheDocument();
      expect(screen.queryByText("Backup")).not.toBeInTheDocument();
      expect(screen.queryByText("Database")).not.toBeInTheDocument();
    });

    it("selection still works with hierarchical teams", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={hierarchicalTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      fireEvent.click(screen.getByText("Infrastructure"));

      expect(onChange).toHaveBeenCalledWith([2]);
    });

    it("shows selected team chips", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={hierarchicalTeams} value={[2, 3]} onChange={onChange} />);

      expect(screen.getByText("2 teams selected")).toBeInTheDocument();
    });

    it("clears all selections", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={hierarchicalTeams} value={[2, 3]} onChange={onChange} />);

      fireEvent.click(screen.getByText("Clear all"));
      expect(onChange).toHaveBeenCalledWith([]);
    });
  });

  describe("partial team objects (no parent_team_id)", () => {
    it("renders teams without parent_team_id as roots (flat, current behavior)", () => {
      const partialTeams = [
        { id: 10, name: "Coverage Team", code: "COV" },
        { id: 11, name: "Other Team", code: "OTH" },
      ];
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={partialTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("Coverage Team")).toBeInTheDocument();
      expect(screen.getByText("Other Team")).toBeInTheDocument();
    });
  });

  describe("cycle / self-reference safety (B1)", () => {
    it("team with parent_team === id (self-reference) renders as root, does not crash", () => {
      const selfRefTeams = [
        { id: 1, name: "Self Ref Team", code: "SELF", parent_team: 1 },
        { id: 2, name: "Normal Team", code: "NORM", parent_team: null },
      ];
      const onChange = vi.fn();
      // Should not throw / stack overflow.
      render(<TeamMultiSelect teams={selfRefTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("Self Ref Team")).toBeInTheDocument();
      expect(screen.getByText("Normal Team")).toBeInTheDocument();
    });

    it("cycle (A.parent=B, B.parent=A) — both render as roots, does not crash", () => {
      const cycleTeams = [
        { id: 1, name: "Alpha", code: "ALPHA", parent_team: 2 },
        { id: 2, name: "Beta", code: "BETA", parent_team: 1 },
        { id: 3, name: "Gamma", code: "GAMMA", parent_team: null },
      ];
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={cycleTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();
      expect(screen.getByText("Gamma")).toBeInTheDocument();
    });

    it("dangling parent (parent_team points to non-existent team) renders as root", () => {
      const danglingTeams = [
        { id: 1, name: "Orphan Team", code: "ORPH", parent_team: 999 },
        { id: 2, name: "Root Team", code: "ROOT", parent_team: null },
      ];
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={danglingTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("Orphan Team")).toBeInTheDocument();
      expect(screen.getByText("Root Team")).toBeInTheDocument();
    });

    it("deep nesting (depth > 6) clamps indent, does not crash", () => {
      // Build a chain of 15 teams, each parent of the next (depth 0..14).
      // Depth > 6 should clamp indent; depth <= 20 should still render.
      const deepTeams = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        name: `Level ${i + 1}`,
        code: `L${i + 1}`,
        parent_team: i === 0 ? null : i,
      }));
      const onChange = vi.fn();
      // Should not throw / stack overflow.
      render(<TeamMultiSelect teams={deepTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("Level 1")).toBeInTheDocument();
      expect(screen.getByText("Level 15")).toBeInTheDocument();
    });

    it("depth guard (>20) stops rendering without crashing", () => {
      // Build a chain of 25 teams; depth > 20 should not render but must not crash.
      const deepTeams = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `Deep ${i + 1}`,
        code: `D${i + 1}`,
        parent_team: i === 0 ? null : i,
      }));
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={deepTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      // Level 1 (root) and Level 20 (depth 19) render; Level 25 (depth 24) does not.
      expect(screen.getByText("Deep 1")).toBeInTheDocument();
      expect(screen.getByText("Deep 20")).toBeInTheDocument();
      expect(screen.queryByText("Deep 25")).not.toBeInTheDocument();
    });
  });

  describe("accessibility (H6)", () => {
    it("sets aria-level on option elements", () => {
      const onChange = vi.fn();
      render(<TeamMultiSelect teams={hierarchicalTeams} value={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole("button"));
      const options = screen.getAllByRole("option");
      // Root option should have aria-level=1, sub-team aria-level=2.
      const rootOption = options.find((el) => el.textContent?.includes("Albanian Operations"));
      const subOption = options.find((el) => el.textContent?.includes("Infrastructure"));
      expect(rootOption).toBeDefined();
      expect(subOption).toBeDefined();
      expect(rootOption!.getAttribute("aria-level")).toBe("1");
      expect(subOption!.getAttribute("aria-level")).toBe("2");
    });
  });
});
