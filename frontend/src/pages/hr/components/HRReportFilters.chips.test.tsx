import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HRReportFilters } from "./HRReportFilters";

const baseProps = {
  start: "2026-07-01",
  onStartChange: vi.fn(),
  end: "2026-07-31",
  onEndChange: vi.fn(),
  selectedItalianTL: "all",
  onItalianTLChange: vi.fn(),
  selectedAlbanianTL: "all",
  onAlbanianTLChange: vi.fn(),
  selectedTeam: "all",
  onTeamChange: vi.fn(),
  selectedWorkspace: "all",
  onWorkspaceChange: vi.fn(),
  onResetFilters: vi.fn(),
  italianTLs: [{ id: 1, full_name: "Mario Rossi", member_count: 4 }],
  albanianTLs: [{ id: 2, full_name: "Bledi Hoxha", member_count: 3 }],
  teams: [{ id: 3, name: "Core Team", code: "CORE", members_count: 6 }],
  workspaces: [{ id: 4, name: "Tirana", user_count: 9 }],
  isLoading: false,
  onGenerate: vi.fn(),
};

describe("HRReportFilters active filter chips", () => {
  it("shows no chips while every filter is on All", () => {
    render(<HRReportFilters {...baseProps} />);
    expect(screen.queryByRole("group", { name: "Active filters" })).not.toBeInTheDocument();
  });

  it("shows a chip per chosen filter, naming the person, team or workspace", () => {
    render(
      <HRReportFilters
        {...baseProps}
        selectedItalianTL="1"
        selectedAlbanianTL="none"
        selectedTeam="3"
        selectedWorkspace="4"
      />
    );
    expect(screen.getByText("Manager: Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("Line Manager: None")).toBeInTheDocument();
    expect(screen.getByText("Team: Core Team")).toBeInTheDocument();
    expect(screen.getByText("Workspace: Tirana")).toBeInTheDocument();
  });

  it("removing a chip puts only that filter back to All", () => {
    const onTeamChange = vi.fn();
    render(
      <HRReportFilters
        {...baseProps}
        selectedTeam="3"
        selectedWorkspace="4"
        onTeamChange={onTeamChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Team: Core Team" }));
    expect(onTeamChange).toHaveBeenCalledWith("all");
  });

  it("Reset all filters calls the page reset", () => {
    const onResetFilters = vi.fn();
    render(<HRReportFilters {...baseProps} selectedTeam="3" onResetFilters={onResetFilters} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset all filters" }));
    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });
});
