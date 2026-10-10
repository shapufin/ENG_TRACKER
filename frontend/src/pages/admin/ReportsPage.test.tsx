import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReportsPage } from "./ReportsPage";

const page = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const archive = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 }, isLoading: false }),
}));
vi.mock("./hooks/useReportsPage", () => ({ useReportsPage: () => page.value }));
vi.mock("./hooks/useReportArchive", () => ({
  useReportArchive: () => ({
    enabled: archive.enabled,
    exports: { data: [], isLoading: false, isError: false, enabled: archive.enabled },
    schedules: { data: [], isLoading: false, isError: false, enabled: false },
  }),
}));
vi.mock("./components/OvertimeStandbyReport", () => ({ OvertimeStandbyReport: () => <div /> }));
vi.mock("./components/VacationReport", () => ({ VacationReport: () => <div /> }));
vi.mock("./components/ReportUserTable", () => ({ ReportUserTable: () => <div /> }));

const base = {
  activeTab: "overtime_standby",
  setActiveTab: vi.fn(),
  start: "2026-10-01",
  setStart: vi.fn(),
  end: "2026-10-31",
  setEnd: vi.fn(),
  selectedTeam: "all",
  setSelectedTeam: vi.fn(),
  groupBy: "month",
  setGroupBy: vi.fn(),
  hasGenerated: false,
  teams: [],
  summaryData: undefined,
  detailedData: undefined,
  isLoading: false,
  handleGenerate: vi.fn(),
  downloadExcel: vi.fn(),
  filteredUsersData: [],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>
  );

describe("ReportsPage", () => {
  beforeEach(() => {
    archive.enabled = false;
    page.value = { ...base };
  });

  it("shows the compact empty state before generating", () => {
    renderPage();
    expect(screen.getByText("Pick a period, then generate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this month" })).toBeInTheDocument();
  });

  it("shows the KPI strip values on the generated OT tab", () => {
    page.value = {
      ...base,
      hasGenerated: true,
      summaryData: {
        overtime: { total_hours: 12, total_entries: 3, approved_hours: 10, pending_count: 1 },
        standby: { total_hours: 20, total_entries: 4, approved_hours: 20, pending_count: 2 },
      },
      detailedData: { users: [] },
    };
    renderPage();
    const strip = screen.getByRole("region", { name: /Report totals/ });
    expect(within(strip).getByText("12h")).toBeInTheDocument();
    expect(within(strip).getByText("20h")).toBeInTheDocument();
    expect(screen.getByText("Results")).toBeInTheDocument();
  });

  it("omits the archive panel when the analytics plugin is inactive", () => {
    page.value = {
      ...base,
      hasGenerated: true,
      summaryData: { overtime: undefined },
      detailedData: { users: [] },
    };
    renderPage();
    expect(screen.queryByText("Recent exports")).not.toBeInTheDocument();
  });

  it("shows the archive panel when enabled", () => {
    archive.enabled = true;
    renderPage();
    expect(screen.getByText("Recent exports")).toBeInTheDocument();
  });
});
