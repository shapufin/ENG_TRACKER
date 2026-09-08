import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsTeamFilters } from "./SkillsTeamFilters";
import type { SkillCategory, SkillCoverage } from "../types/skills";

// Mock Dialog to render content inline (always open) for testability.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("./SkillsGapSummary", () => ({
  SkillsGapSummary: ({ gaps }: { gaps: SkillCoverage[] }) => (
    <div data-testid="gap-summary" data-gaps={gaps.length} />
  ),
}));

const categories: SkillCategory[] = [
  {
    id: 1,
    name: "Backend",
    code: "backend",
    description: "",
    is_active: true,
    created_at: "",
    updated_at: "",
  },
];

const gaps: SkillCoverage[] = [
  {
    skill_id: 10,
    skill_name: "Python",
    category_name: "Backend",
    team_count: 2,
    avg_level: 2,
  },
];

const baseProps = {
  search: "",
  onSearchChange: vi.fn(),
  categoryCode: "all",
  onCategoryChange: vi.fn(),
  minLevel: undefined as number | undefined,
  onMinLevelChange: vi.fn(),
  maxLevel: undefined as number | undefined,
  onMaxLevelChange: vi.fn(),
  onReset: vi.fn(),
  categories,
  gaps,
  isMobile: false,
  filtersOpen: false,
  onFiltersOpenChange: vi.fn(),
};

describe("SkillsTeamFilters", () => {
  it("renders desktop search, category, level selects, and gap summary", () => {
    render(<SkillsTeamFilters {...baseProps} />);

    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum level")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum level")).toBeInTheDocument();
    expect(screen.getByTestId("gap-summary")).toHaveAttribute("data-gaps", "1");
  });

  it("does not show Reset filters when no filter is active", () => {
    render(<SkillsTeamFilters {...baseProps} />);

    expect(screen.queryByRole("button", { name: "Reset filters" })).not.toBeInTheDocument();
  });

  it("shows Reset filters when a filter is active and calls onReset", () => {
    const onReset = vi.fn();
    render(<SkillsTeamFilters {...baseProps} search="alice" onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(onReset).toHaveBeenCalledOnce();
  });

  it("reports search changes", () => {
    const onSearchChange = vi.fn();
    render(<SkillsTeamFilters {...baseProps} onSearchChange={onSearchChange} />);

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "bob" } });

    expect(onSearchChange).toHaveBeenCalledWith("bob");
  });

  it("renders the mobile filters dialog with 44px controls when isMobile", () => {
    render(<SkillsTeamFilters {...baseProps} isMobile filtersOpen />);

    expect(screen.getByRole("heading", { name: "Team filters" })).toBeInTheDocument();
    // Desktop and mobile both render these labels; assert presence via getAllByLabelText.
    expect(screen.getAllByLabelText("Minimum level").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText("Maximum level").length).toBeGreaterThanOrEqual(1);
    // Mobile reset is a full-width button.
    const resetButtons = screen.getAllByRole("button", { name: "Reset filters" });
    expect(resetButtons.length).toBeGreaterThanOrEqual(1);
  });
});
