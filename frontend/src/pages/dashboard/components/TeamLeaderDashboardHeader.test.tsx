import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamLeaderDashboardHeader } from "./TeamLeaderDashboardHeader";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

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

  it("renders Team Leader / Team Workspace as a segmented control, not a raw text-primary pill", () => {
    renderHeader();

    const workspaceTab = screen.getByRole("tab", { name: "Team Workspace" });
    const leaderTab = screen.getByRole("tab", { name: "Team Leader" });
    expect(workspaceTab.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    expect(leaderTab.getAttribute("data-state")).toBe("active");
    expect(workspaceTab.getAttribute("data-state")).toBe("inactive");
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
