import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamLeaderDashboardHeader } from "./TeamLeaderDashboardHeader";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderHeader = (props = {}) =>
  render(
    <MemoryRouter>
      <TeamLeaderDashboardHeader
        availableDashboards={["team_leader", "employee"]}
        selectedDashboard="team_leader"
        onDashboardChange={vi.fn()}
        isTeamLeader
        isHR={false}
        isAdmin={false}
        isSuperuser={false}
        {...props}
      />
    </MemoryRouter>
  );

describe("TeamLeaderDashboardHeader mockup fidelity", () => {
  it("renders controls only (PageShell owns the title — no duplicate h1)", () => {
    renderHeader();

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Approval Queue/ })).toBeInTheDocument();
  });

  it("renders one segment per available dashboard plus Team Workspace", () => {
    renderHeader();

    expect(screen.getByRole("tab", { name: "Team Leader" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Personal" })).toHaveAttribute("data-state", "inactive");
    expect(screen.getByRole("tab", { name: "Team Workspace" })).toBeInTheDocument();
  });

  it("switches dashboard when a segment is selected", () => {
    const onDashboardChange = vi.fn();
    renderHeader({ onDashboardChange });

    // Radix Tabs activates on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Personal" }));
    expect(onDashboardChange).toHaveBeenCalledWith("employee");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to the team workspace when its segment is selected", () => {
    renderHeader();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Team Workspace" }));
    expect(mockNavigate).toHaveBeenCalledWith("/team");
  });

  it("renders all four dashboard segments for multi-role users", () => {
    renderHeader({ availableDashboards: ["admin", "hr", "team_leader", "employee"] });

    for (const name of ["Admin", "HR", "Team Leader", "Personal", "Team Workspace"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("keeps the workspace segment for single-dashboard users", () => {
    renderHeader({ availableDashboards: ["team_leader"], selectedDashboard: "team_leader" });

    expect(screen.getByRole("tab", { name: "Team Leader" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Team Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Personal" })).not.toBeInTheDocument();
  });

  it("does not render a count badge when pendingApprovalCount is omitted or zero", () => {
    renderHeader();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders a pending count badge on the approval queue button", () => {
    renderHeader({ pendingApprovalCount: 10 });
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
