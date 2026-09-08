import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminDashboardWidgets } from "./AdminDashboardWidgets";

// Audit 2026-09-07: the recent-activity widget rendered (and its audit_log
// query fired) for users without the audit_log plugin view permission —
// HR got a 403 + error toast on every admin dashboard visit.
const mockCanView = vi.fn(() => true);
vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({ canView: mockCanView }),
}));

const baseProps = {
  isWidgetActive: (id: string) => id === "recent-activity",
  totalUsers: 1,
  totalTeams: 1,
  totalPending: 0,
  overtimeSummary: null,
  hoursData: [],
  statusData: [],
  auditLogs: [],
  statsLoading: false,
  auditLogsLoading: false,
};

describe("AdminDashboardWidgets recent-activity gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanView.mockReturnValue(true);
  });

  it("renders recent activity when audit_log view is permitted", () => {
    render(
      <MemoryRouter>
        <AdminDashboardWidgets {...baseProps} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("recent-activity-widget")).toBeInTheDocument();
  });

  it("hides recent activity when audit_log view is denied", () => {
    mockCanView.mockReturnValue(false);
    render(
      <MemoryRouter>
        <AdminDashboardWidgets {...baseProps} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("recent-activity-widget")).not.toBeInTheDocument();
  });
});
