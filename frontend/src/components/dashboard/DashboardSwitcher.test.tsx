import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardSwitcher } from "./DashboardSwitcher";
import type { DashboardType } from "@/context/permission-context-base";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const baseProps: {
  availableDashboards: DashboardType[];
  selectedDashboard: DashboardType;
  onDashboardChange: (dashboard: DashboardType) => void;
} = {
  availableDashboards: ["team_leader", "employee"],
  selectedDashboard: "team_leader",
  onDashboardChange: vi.fn(),
};

const renderSwitcher = (
  props: Partial<{
    availableDashboards: DashboardType[];
    selectedDashboard: DashboardType;
    onDashboardChange: (dashboard: DashboardType) => void;
    showWorkspaceTab: boolean;
  }> = {}
) =>
  render(
    <MemoryRouter>
      <DashboardSwitcher {...baseProps} {...props} />
    </MemoryRouter>
  );

describe("DashboardSwitcher", () => {
  it("renders one segment per available dashboard", () => {
    renderSwitcher();

    expect(screen.getByRole("tab", { name: "Team Leader" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Personal" })).toHaveAttribute("data-state", "inactive");
    expect(screen.queryByRole("tab", { name: "Team Workspace" })).not.toBeInTheDocument();
  });

  it("switches dashboard when a segment is selected", () => {
    const onDashboardChange = vi.fn();
    renderSwitcher({ onDashboardChange });

    // Radix Tabs activates on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Personal" }));
    expect(onDashboardChange).toHaveBeenCalledWith("employee");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("adds a workspace segment that navigates when showWorkspaceTab is set", () => {
    renderSwitcher({ showWorkspaceTab: true });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Team Workspace" }));
    expect(mockNavigate).toHaveBeenCalledWith("/team");
  });

  it("renders nothing for single-dashboard users without a workspace tab", () => {
    renderSwitcher({
      availableDashboards: ["employee"],
      selectedDashboard: "employee",
    });

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
