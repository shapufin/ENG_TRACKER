import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsTeamToolbar } from "./SkillsTeamToolbar";

vi.mock("./SkillsColumnSelector", () => ({
  SkillsColumnSelector: () => <div data-testid="column-selector" />,
}));

describe("SkillsTeamToolbar", () => {
  const props = {
    viewMode: "matrix" as const,
    onViewModeChange: vi.fn(),
    memberCount: 4,
    isMobile: false,
    onFiltersOpen: vi.fn(),
    coverage: [],
    visibleSkillIds: new Set<number>(),
    onVisibleSkillIdsChange: vi.fn(),
  };

  it("renders view controls, member count, and column selector", () => {
    render(<SkillsTeamToolbar {...props} />);

    expect(screen.getByRole("group", { name: "Skills view" })).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("4 Members")).toBeInTheDocument();
    expect(screen.getByTestId("column-selector")).toBeInTheDocument();
  });

  it("renders four view mode buttons: Matrix, Dense, Heatmap, List", () => {
    render(<SkillsTeamToolbar {...props} />);

    expect(screen.getByRole("button", { name: /matrix/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dense/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /heatmap/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /list/i })).toBeInTheDocument();
  });

  it("marks the active mode with aria-pressed", () => {
    render(<SkillsTeamToolbar {...props} viewMode="heatmap" />);

    expect(screen.getByRole("button", { name: /heatmap/i }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: /matrix/i }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("marks the dense mode with aria-pressed when active", () => {
    render(<SkillsTeamToolbar {...props} viewMode="dense" />);

    expect(screen.getByRole("button", { name: /dense/i }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: /matrix/i }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("marks the list mode with aria-pressed when active", () => {
    render(<SkillsTeamToolbar {...props} viewMode="list" />);

    expect(screen.getByRole("button", { name: /list/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /matrix/i }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("calls onViewModeChange with 'dense' when Dense is clicked", () => {
    const onViewModeChange = vi.fn();
    render(<SkillsTeamToolbar {...props} onViewModeChange={onViewModeChange} />);

    fireEvent.click(screen.getByRole("button", { name: /dense/i }));

    expect(onViewModeChange).toHaveBeenCalledWith("dense");
  });

  it("calls onViewModeChange with 'heatmap' when Heatmap is clicked", () => {
    const onViewModeChange = vi.fn();
    render(<SkillsTeamToolbar {...props} onViewModeChange={onViewModeChange} />);

    fireEvent.click(screen.getByRole("button", { name: /heatmap/i }));

    expect(onViewModeChange).toHaveBeenCalledWith("heatmap");
  });

  it("opens mobile filters from the toolbar", () => {
    const onFiltersOpen = vi.fn();
    render(<SkillsTeamToolbar {...props} isMobile onFiltersOpen={onFiltersOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(onFiltersOpen).toHaveBeenCalledOnce();
  });
});
