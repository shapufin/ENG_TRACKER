import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TicketKPITeamPage } from "./TicketKPITeamPage";
import * as useTicketKPITeamPage from "./hooks/useTicketKPITeamPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("./hooks/useTicketKPITeamPage", () => ({
  useTicketKPITeamPage: vi.fn(),
}));

const usePermissionMock = vi.hoisted(() => vi.fn());
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissionMock(),
}));

vi.mock("../components/KPICard", () => ({
  KPICard: (props: any) => (
    <div
      data-testid="kpi-card"
      data-title={props.title}
      data-color={props.progressColorClass}
      data-percent={props.progressPercent}
    />
  ),
}));
vi.mock("../components/KPITrendChart", () => ({
  KPITrendChart: () => <div data-testid="trend-chart" />,
}));
vi.mock("../components/TicketKPITeamMemberTable", () => ({
  TicketKPITeamMemberTable: () => <div data-testid="member-table" />,
}));
vi.mock("../components/TicketKPITeamYearlyTab", () => ({
  TicketKPITeamYearlyTab: () => <div data-testid="yearly-tab" />,
}));
vi.mock("../components/links/AutoMatchReview", () => ({
  AutoMatchReview: () => null,
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div data-testid="tabs">{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => <div data-testid={`trigger-${value}`}>{children}</div>,
  TabsContent: ({ children, value }: any) => <div data-testid={`content-${value}`}>{children}</div>,
}));

const baseHook = {
  isTeamLeader: true,
  activeTab: "monthly" as const,
  setActiveTab: vi.fn(),
  selectedMonth: "2024-06",
  setSelectedMonth: vi.fn(),
  selectedYear: 2024,
  setSelectedYear: vi.fn(),
  monthOptions: ["2024-06", "2024-05"],
  yearOptions: [2024, 2023],
  teamSummary: { total_tickets: 10, members: 3, avg_resolution_hours: 2, sla_compliance_pct: 95 },
  summaryLoading: false,
  yearlySummary: null,
  yearlyLoading: false,
  stats: { total: 10, members: 3, avgRes: 2, sla: 95 },
  yearlyStats: { total: 0, members: 0, avgRes: null, sla: null },
  trendChartData: [],
  yearlyTrendChartData: [],
  members: [],
};

beforeEach(() => {
  usePermissionMock.mockReturnValue({ isAdmin: false, isHR: false, isTeamLeader: false });
});

describe("TicketKPITeamPage", () => {
  it("shows permission denied for non-team-leader", () => {
    vi.mocked(useTicketKPITeamPage.useTicketKPITeamPage).mockReturnValue({
      ...baseHook,
      isTeamLeader: false,
    } as any);
    render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText("You do not have team leader permissions.")).toBeInTheDocument();
    // Icon-centered shared empty state (muted circle), not bare text.
    expect(document.querySelector(".rounded-full.bg-muted svg.lucide-shield-alert")).not.toBeNull();
  });

  it("denial state guides admins/HR to HR Reports instead of a dead end", () => {
    vi.mocked(usePermissionMock).mockReturnValue({
      ...(usePermissionMock() as object),
      isAdmin: true,
      isHR: false,
    } as any);
    vi.mocked(useTicketKPITeamPage.useTicketKPITeamPage).mockReturnValue({
      ...baseHook,
      isTeamLeader: false,
    } as any);
    render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/reserved for assigned Team Leaders/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Go to HR Reports/i });
    expect(link.getAttribute("href")).toBe("/hr/reports");
  });

  it("denial state hides the HR Reports shortcut from plain employees", () => {
    vi.mocked(usePermissionMock).mockReturnValue({
      ...(usePermissionMock() as object),
      isAdmin: false,
      isHR: false,
    } as any);
    vi.mocked(useTicketKPITeamPage.useTicketKPITeamPage).mockReturnValue({
      ...baseHook,
      isTeamLeader: false,
    } as any);
    render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );
    expect(screen.queryByRole("link", { name: /Go to HR Reports/i })).not.toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(useTicketKPITeamPage.useTicketKPITeamPage).mockReturnValue({
      ...baseHook,
      summaryLoading: true,
      teamSummary: null,
    } as any);
    render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders dashboard with data", () => {
    vi.mocked(useTicketKPITeamPage.useTicketKPITeamPage).mockReturnValue({
      ...baseHook,
      members: [{ user_id: 1, username: "alice" }],
    } as any);
    render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Team KPI Review")).toBeInTheDocument();
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });

  it("disables export when no members", () => {
    vi.mocked(useTicketKPITeamPage.useTicketKPITeamPage).mockReturnValue({ ...baseHook } as any);
    render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Export CSV")).toBeDisabled();
  });

  it("renders monthly and yearly tab triggers", () => {
    vi.mocked(useTicketKPITeamPage.useTicketKPITeamPage).mockReturnValue({
      ...baseHook,
      members: [{ user_id: 1, username: "alice" }],
    } as any);
    render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId("trigger-monthly")).toBeInTheDocument();
    expect(screen.getByTestId("trigger-yearly")).toBeInTheDocument();
  });

  it("hides export button on yearly tab", () => {
    vi.mocked(useTicketKPITeamPage.useTicketKPITeamPage).mockReturnValue({
      ...baseHook,
      activeTab: "yearly",
    } as any);
    render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );
    expect(screen.queryByText("Export CSV")).not.toBeInTheDocument();
  });

  it("renders member breakdown inside a GlassCard surface", () => {
    const { container } = render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );

    expect(container.querySelector(".shadow-glass")).toBeInTheDocument();
  });

  it("renders Avg Resolution bar in mockup blue (not amber)", () => {
    vi.mocked(useTicketKPITeamPage.useTicketKPITeamPage).mockReturnValue({ ...baseHook } as any);
    render(
      <MemoryRouter>
        <TicketKPITeamPage />
      </MemoryRouter>
    );
    const cards = screen.getAllByTestId("kpi-card");
    const avgCard = cards.find((c) => c.getAttribute("data-title") === "Avg Resolution");
    expect(avgCard).toBeDefined();
    // TL/team-performance.html:84 + TL/ticket-kpi.html:75 both use bg-blue-500.
    expect(avgCard!.getAttribute("data-color")).toBe("bg-blue-500");
  });
});
