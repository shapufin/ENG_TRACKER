import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsPage } from "./AnalyticsPage";

vi.mock("@/components/ui/AnimatedNumber", () => ({
  AnimatedNumber: ({ value }: { value: number }) => <span>{value}</span>,
}));
vi.mock("@/components/auth/PluginPermissionGuard", () => ({
  PluginPermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({ canManage: () => false, canExport: () => true }),
}));
vi.mock("@/components/analytics/ReportsPanel", () => ({ ReportsPanel: () => null }));
vi.mock("@/components/analytics/ScheduledReportsPanel", () => ({
  ScheduledReportsPanel: () => null,
}));
vi.mock("@/components/analytics/AnalyticsFilters", () => ({ AnalyticsFilters: () => null }));
vi.mock("@/lib/export-analytics", () => ({ exportAnalytics: vi.fn() }));
vi.mock("./hooks/useAnalyticsPage", () => ({ useAnalyticsPage: vi.fn() }));

import { useAnalyticsPage } from "./hooks/useAnalyticsPage";

const setSelectedPeriod = vi.fn();

const hookValue = () => ({
  PERIODS: ["week", "month", "year", "custom"],
  selectedPeriod: "month",
  setSelectedPeriod,
  dateRange: { from: "", to: "" },
  setDateRange: vi.fn(),
  selectedTeams: [],
  setSelectedTeams: vi.fn(),
  selectedUsers: [],
  setSelectedUsers: vi.fn(),
  selectedStatuses: [],
  setSelectedStatuses: vi.fn(),
  selectedCategories: [],
  setSelectedCategories: vi.fn(),
  exportFormat: "excel",
  setExportFormat: vi.fn(),
  configModalOpen: false,
  setConfigModalOpen: vi.fn(),
  showFilters: false,
  setShowFilters: vi.fn(),
  teams: [],
  usersList: [],
  analytics: { metrics: [] },
  isLoading: false,
  error: null,
  hotspotsData: [],
  trends: { overtime: [], standby: [], leave: [], user_activity: [] },
  insights: [],
  insightsLoading: false,
  activeFilterCount: 0,
  clearFilters: vi.fn(),
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    setSelectedPeriod.mockClear();
    vi.mocked(useAnalyticsPage).mockReturnValue(hookValue() as never);
  });

  it("offers exactly one Export button", () => {
    renderPage();
    expect(screen.getAllByRole("button", { name: /export/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Export Report" })).not.toBeInTheDocument();
  });

  it("labels the page sections", () => {
    renderPage();
    for (const name of ["Overview", "Trends", "Exports & schedules"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("empty trends offer 'Show this year' which requests the year period", () => {
    renderPage();
    const actions = screen.getAllByRole("button", { name: "Show this year" });
    expect(actions.length).toBeGreaterThan(0);
    actions[0].click();
    expect(setSelectedPeriod).toHaveBeenCalledWith("year");
  });
});
