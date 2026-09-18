import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamLeaderDashboardHeader } from "./TeamLeaderDashboardHeader";

const renderHeader = () =>
  render(
    <MemoryRouter>
      <TeamLeaderDashboardHeader
        availableDashboards={["team_leader"]}
        selectedDashboard="team_leader"
        onDashboardChange={vi.fn()}
        isTeamLeader
        isHR={false}
        isAdmin={false}
        isSuperuser={false}
      />
    </MemoryRouter>
  );

describe("TeamLeaderDashboardHeader mockup fidelity", () => {
  it("uses the mockup page-header treatment (font-black title, bottom border)", () => {
    renderHeader();

    const title = screen.getByRole("heading", { level: 1, name: "Approval Dashboard" });
    expect(title.className).toContain("text-2xl");
    expect(title.className).toContain("font-black");
    expect(title.className).not.toContain("sm:text-3xl");

    const headerRow = title.closest(".border-b");
    expect(headerRow).toBeTruthy();
    expect(headerRow?.className).toContain("pb-3");
    expect(headerRow?.className).toContain("border-line-subtle");
  });

  it("Team Workspace pill uses text-foreground, not text-primary (browser probe: 3.32:1 dark FAIL)", () => {
    renderHeader();

    const pill = screen.getByText("Team Workspace");
    expect(pill.className).toContain("text-foreground");
    expect(pill.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });

  it("does not render a count badge when pendingApprovalCount is omitted or zero", () => {
    renderHeader();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders a pending count badge on the approval queue button", () => {
    render(
      <MemoryRouter>
        <TeamLeaderDashboardHeader
          availableDashboards={["team_leader"]}
          selectedDashboard="team_leader"
          onDashboardChange={vi.fn()}
          isTeamLeader
          isHR={false}
          isAdmin={false}
          isSuperuser={false}
          pendingApprovalCount={10}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
