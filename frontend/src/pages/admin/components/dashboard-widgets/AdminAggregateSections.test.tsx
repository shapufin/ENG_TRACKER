import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { TrendsSection } from "./TrendsSection";
import { PeopleSection } from "./PeopleSection";
import { makePeople, makeTrends } from "./adminFixtures";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 240 }}>{children}</div>
    ),
  };
});
vi.mock("@/services/dashboardService", () => ({
  dashboardService: { getAdminTrends: vi.fn(), getAdminPeople: vi.fn() },
}));

const renderWith = (ui: React.ReactElement, url = "/admin") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dashboardService.getAdminTrends).mockResolvedValue(makeTrends());
  vi.mocked(dashboardService.getAdminPeople).mockResolvedValue(makePeople());
});

describe("TrendsSection", () => {
  it("does not call the endpoint when no trend widget is active", () => {
    renderWith(<TrendsSection isWidgetActive={() => false} />);
    expect(dashboardService.getAdminTrends).not.toHaveBeenCalled();
  });

  it("fetches exactly once for several active widgets and renders only the active ones", async () => {
    renderWith(
      <TrendsSection isWidgetActive={(id) => id === "ot-by-client" || id === "who-is-out"} />
    );
    expect(await screen.findByText("Overtime by Client")).toBeInTheDocument();
    expect(screen.getByText("Who's Out Today")).toBeInTheDocument();
    expect(screen.queryByText("Team Comparison")).not.toBeInTheDocument();
    expect(dashboardService.getAdminTrends).toHaveBeenCalledTimes(1);
  });

  it("shows an error card with retry when the request fails", async () => {
    vi.mocked(dashboardService.getAdminTrends).mockRejectedValue(new Error("boom"));
    renderWith(<TrendsSection isWidgetActive={(id) => id === "ot-by-client"} />);
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("TrendsSection period", () => {
  const active = (id: string) => id === "ot-standby-trend";

  it("requests 12 months by default", async () => {
    renderWith(<TrendsSection isWidgetActive={active} />);
    await screen.findByText("Overtime & Standby Trend");
    expect(dashboardService.getAdminTrends).toHaveBeenCalledWith(12);
  });

  it("uses ?months= from the URL", async () => {
    renderWith(<TrendsSection isWidgetActive={active} />, "/admin?months=6");
    await screen.findByText("Overtime & Standby Trend");
    expect(dashboardService.getAdminTrends).toHaveBeenCalledWith(6);
    expect(dashboardService.getAdminTrends).not.toHaveBeenCalledWith(12);
  });

  it("ignores an invalid ?months= and refetches when the selector changes", async () => {
    renderWith(<TrendsSection isWidgetActive={active} />, "/admin?months=99");
    await screen.findByText("Overtime & Standby Trend");
    expect(dashboardService.getAdminTrends).toHaveBeenCalledWith(12);
    fireEvent.click(screen.getByRole("button", { name: "6 months" }));
    await vi.waitFor(() => expect(dashboardService.getAdminTrends).toHaveBeenCalledWith(6));
  });

  it("describes the window the data actually covers", async () => {
    const six = makeTrends({
      months: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
      hours: {
        overtime: [0, 0, 0, 3, 0, 1],
        standby: Array(6).fill(0),
        pending_overtime: Array(6).fill(0),
      },
    });
    vi.mocked(dashboardService.getAdminTrends).mockResolvedValue(six);
    renderWith(<TrendsSection isWidgetActive={active} />, "/admin?months=6");
    expect(await screen.findByText(/last 6 months/i)).toBeInTheDocument();
  });

  it("shows no selector when no trend widget is on", () => {
    renderWith(<TrendsSection isWidgetActive={() => false} />);
    expect(screen.queryByRole("group", { name: "Trend period" })).not.toBeInTheDocument();
  });
});

describe("PeopleSection", () => {
  it("does not call the endpoint when no people widget is active", () => {
    renderWith(<PeopleSection isWidgetActive={() => false} />);
    expect(dashboardService.getAdminPeople).not.toHaveBeenCalled();
  });

  it("fetches once and renders the active widgets", async () => {
    renderWith(
      <PeopleSection isWidgetActive={(id) => id === "role-distribution" || id === "approver-sla"} />
    );
    expect(await screen.findByText("Role Distribution")).toBeInTheDocument();
    expect(screen.getByText("Approver Speed")).toBeInTheDocument();
    expect(screen.queryByText("Tech Distribution")).not.toBeInTheDocument();
    expect(dashboardService.getAdminPeople).toHaveBeenCalledTimes(1);
  });
});
