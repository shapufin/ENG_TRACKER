import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HRReportsPage } from "./HRReportsPage";

const useHRReportManagementMock = vi.fn();
const handleGenerate = vi.fn();

vi.mock("@/hooks/useHRReportManagement", () => ({
  useHRReportManagement: (args: unknown) => useHRReportManagementMock(args),
}));
vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

describe("HRReportsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    // The results area renders DataTable, which observes its scroll container.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    handleGenerate.mockClear();
    useHRReportManagementMock.mockReset();
    useHRReportManagementMock.mockReturnValue({
      italianTLs: [],
      albanianTLs: [],
      teams: [],
      workspaces: [],
      summaryLoading: false,
      detailedData: undefined,
      detailedLoading: false,
      trendReport: undefined,
      leaveList: undefined,
      insightsData: undefined,
      topTeamLeadersData: undefined,
      handleGenerate,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to the current business month", () => {
    render(<HRReportsPage />);
    expect(useHRReportManagementMock).toHaveBeenCalledWith(
      expect.objectContaining({ start: "2026-07-01", end: "2026-07-31" })
    );
    expect(screen.getByRole("button", { name: /Open date range picker/ })).toHaveTextContent(
      "01/07/2026 - 31/07/2026"
    );
  });

  it("runs the report once on first render without a Generate click", () => {
    render(<HRReportsPage />);
    expect(handleGenerate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("HR Strategic Analysis")).not.toBeInTheDocument();
  });

  it("filters the whole report to a leader clicked in the ranking and re-runs it", () => {
    useHRReportManagementMock.mockReturnValue({
      ...useHRReportManagementMock.getMockImplementation?.(),
      italianTLs: [{ id: 2, full_name: "Andrea Negro", member_count: 5 }],
      albanianTLs: [],
      teams: [],
      workspaces: [],
      summaryLoading: false,
      detailedData: undefined,
      detailedLoading: false,
      trendReport: undefined,
      leaveList: undefined,
      insightsData: undefined,
      topTeamLeadersData: [
        { id: 2, rank: 1, name: "Andrea Negro", team_name: "MSC_TEAM", total_hours: 279 },
      ],
      handleGenerate,
    });
    render(<HRReportsPage />);
    expect(handleGenerate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: /Andrea Negro/ })[0]);

    expect(useHRReportManagementMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedItalianTL: "2" })
    );
    expect(screen.getByText("Manager: Andrea Negro")).toBeInTheDocument();
    expect(handleGenerate).toHaveBeenCalledTimes(2);
  });
});
