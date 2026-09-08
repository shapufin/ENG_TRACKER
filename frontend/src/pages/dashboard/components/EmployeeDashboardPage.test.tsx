import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { EmployeeDashboardPage } from "./EmployeeDashboardPage";
import type { User } from "@/types";
import type { DashboardType } from "@/context/permission-context-base";

const baseUser: User = {
  id: 1,
  first_name: "Alice",
  username: "alice",
  email: "alice@example.com",
} as User;
const dashboards: DashboardType[] = ["employee"];
const viewProps = {
  user: baseUser,
  overtimeData: null,
  standbyData: null,
  leaveData: null,
  personalOvertimeHours: 0,
  personalStandbyHours: 0,
  approvedLeaveDays: 0,
  pendingLeaveDays: 0,
  overtimeProgress: 0,
  leaveProgress: 0,
  upcomingLeaves: [],
  personalPendingItems: [],
  personalTimelineItems: [],
};

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("EmployeeDashboardPage", () => {
  it("renders welcome message with first name", () => {
    renderWithRouter(
      <EmployeeDashboardPage
        user={baseUser}
        availableDashboards={dashboards}
        selectedDashboard="employee"
        onDashboardChange={vi.fn()}
        isTeamLeader={false}
        isHR={false}
        isAdmin={false}
        isSuperuser={false}
        viewProps={viewProps}
      />
    );
    expect(screen.getByText("Welcome back, Alice")).toBeInTheDocument();
  });

  it("falls back to username when first name is missing", () => {
    const user = { ...baseUser, first_name: null } as unknown as User;
    renderWithRouter(
      <EmployeeDashboardPage
        user={user}
        availableDashboards={dashboards}
        selectedDashboard="employee"
        onDashboardChange={vi.fn()}
        isTeamLeader={false}
        isHR={false}
        isAdmin={false}
        isSuperuser={false}
        viewProps={viewProps}
      />
    );
    expect(screen.getByText("Welcome back, alice")).toBeInTheDocument();
  });

  it("falls back to Employee when user is null", () => {
    renderWithRouter(
      <EmployeeDashboardPage
        user={null}
        availableDashboards={dashboards}
        selectedDashboard="employee"
        onDashboardChange={vi.fn()}
        isTeamLeader={false}
        isHR={false}
        isAdmin={false}
        isSuperuser={false}
        viewProps={viewProps}
      />
    );
    expect(screen.getByText("Welcome back, Employee")).toBeInTheDocument();
  });

  it("renders dashboard header with role flags", () => {
    renderWithRouter(
      <EmployeeDashboardPage
        user={baseUser}
        availableDashboards={dashboards}
        selectedDashboard="employee"
        onDashboardChange={vi.fn()}
        isTeamLeader={true}
        isHR={true}
        isAdmin={true}
        isSuperuser={true}
        viewProps={viewProps}
      />
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
