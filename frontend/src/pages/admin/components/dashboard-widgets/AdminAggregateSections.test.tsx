import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

const renderWith = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>
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
