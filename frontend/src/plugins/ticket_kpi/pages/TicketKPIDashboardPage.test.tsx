import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TicketKPIDashboardPage } from "./TicketKPIDashboardPage";
import * as useTicketKPIDashboard from "./hooks/useTicketKPIDashboard";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("./hooks/useTicketKPIDashboard", () => ({
  useTicketKPIDashboard: vi.fn(),
}));

vi.mock("../components/TicketKPIHeader", () => ({
  TicketKPIHeader: ({ onUpload }: { onUpload: () => void }) => (
    <button onClick={onUpload}>Header Upload</button>
  ),
}));
vi.mock("../components/TicketKPIStats", () => ({
  TicketKPIStats: () => <div data-testid="kpi-stats" />,
}));
vi.mock("../components/KPITrendChart", () => ({
  KPITrendChart: () => <div data-testid="trend-chart" />,
}));
vi.mock("../components/CategoryPieChart", () => ({
  CategoryPieChart: () => <div data-testid="pie-chart" />,
}));
vi.mock("../components/TicketKPIRecentUploads", () => ({
  TicketKPIRecentUploads: () => <div data-testid="recent-uploads" />,
}));
vi.mock("../components/TicketKPIFieldBreakdowns", () => ({
  TicketKPIFieldBreakdowns: () => <div data-testid="field-breakdowns" />,
}));

vi.mock("../components/evidence/TicketKPIEvidenceSection", () => ({
  TicketKPIEvidenceSection: () => <div data-testid="evidence-section" />,
}));
vi.mock("../components/MemberTicketRecordsTable", () => ({
  MemberTicketRecordsTable: () => <div data-testid="ticket-records" />,
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

const baseHook = {
  selectedMonth: "2024-06",
  setSelectedMonth: vi.fn(),
  viewMode: "month" as const,
  selectedYear: 2024,
  setViewMode: vi.fn(),
  setSelectedYear: vi.fn(),
  isFilteredView: false,
  viewUserId: undefined,
  viewUserDisplayName: undefined,
  kpiLoading: false,
  hasData: true,
  stats: { total: 10, closed: 5, avgRes: 2, sla: 95, p50: 1.5, p90: 4.0, comparison: null },
  trendChartData: [],
  categoryChartData: [],
  batches: [],
  fieldBreakdowns: [],
};

describe("TicketKPIDashboardPage", () => {
  it("renders loading state", () => {
    vi.mocked(useTicketKPIDashboard.useTicketKPIDashboard).mockReturnValue({
      ...baseHook,
      kpiLoading: true,
      hasData: false,
    } as any);
    render(
      <MemoryRouter>
        <TicketKPIDashboardPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("renders empty state with upload button", () => {
    vi.mocked(useTicketKPIDashboard.useTicketKPIDashboard).mockReturnValue({
      ...baseHook,
      hasData: false,
    } as any);
    render(
      <MemoryRouter>
        <TicketKPIDashboardPage />
      </MemoryRouter>
    );
    expect(screen.getByText("No ticket data uploaded yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Upload Ticket Data"));
    expect(mockNavigate).toHaveBeenCalledWith("/ticket-kpi/upload");
  });

  it("renders filtered empty state with back button for TL viewing member", () => {
    vi.mocked(useTicketKPIDashboard.useTicketKPIDashboard).mockReturnValue({
      ...baseHook,
      hasData: false,
      isFilteredView: true,
      viewUserId: 42,
    } as any);
    render(
      <MemoryRouter>
        <TicketKPIDashboardPage />
      </MemoryRouter>
    );
    expect(screen.getByText("No KPI data for this member")).toBeInTheDocument();
    expect(screen.queryByText("Upload Ticket Data")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to Team"));
    expect(mockNavigate).toHaveBeenCalledWith("/ticket-kpi/team");
  });

  it("renders dashboard with data", () => {
    vi.mocked(useTicketKPIDashboard.useTicketKPIDashboard).mockReturnValue({ ...baseHook } as any);
    render(
      <MemoryRouter>
        <TicketKPIDashboardPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Ticket KPI Dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-stats")).toBeInTheDocument();
  });

  it("shows filtered title with member name", () => {
    vi.mocked(useTicketKPIDashboard.useTicketKPIDashboard).mockReturnValue({
      ...baseHook,
      isFilteredView: true,
      viewUserId: 42,
      viewUserDisplayName: "Alice Smith",
    } as any);
    render(
      <MemoryRouter>
        <TicketKPIDashboardPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Alice Smith — Ticket KPI")).toBeInTheDocument();
  });
});
