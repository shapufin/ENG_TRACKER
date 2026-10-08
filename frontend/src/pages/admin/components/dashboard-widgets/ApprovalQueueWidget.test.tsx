import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { ApprovalQueueWidget } from "./ApprovalQueueWidget";
import { makeOverview, makePeople } from "./adminFixtures";

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
  dashboardService: { getAdminOverview: vi.fn(), getAdminPeople: vi.fn() },
}));

const STATUS = [
  { name: "Pending OT", value: 2 },
  { name: "Pending SB", value: 3 },
  { name: "Pending Leave", value: 1 },
  { name: "Approved", value: 5 },
  { name: "Rejected", value: 1 },
];

const renderWidget = (props: Partial<React.ComponentProps<typeof ApprovalQueueWidget>> = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApprovalQueueWidget statusData={STATUS} {...props} />
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dashboardService.getAdminOverview).mockResolvedValue(makeOverview());
  vi.mocked(dashboardService.getAdminPeople).mockResolvedValue(makePeople());
});

describe("ApprovalQueueWidget", () => {
  it("opens on Status, from the stats data, without any section request", () => {
    const { container } = renderWidget();
    expect(screen.getByRole("tab", { name: "Status", selected: true })).toBeInTheDocument();
    expect(container.querySelector("[data-chart-section='approval-queue']")).not.toBeNull();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(dashboardService.getAdminOverview).not.toHaveBeenCalled();
    expect(dashboardService.getAdminPeople).not.toHaveBeenCalled();
  });

  it("shows a skeleton on Status while stats load", () => {
    renderWidget({ statsLoading: true });
    expect(screen.queryByText("Rejected")).toBeNull();
    expect(screen.getByRole("status", { name: /loading approval status/i })).toBeInTheDocument();
  });

  it("Aging tab fetches the overview once and shows the backlog and buckets", async () => {
    renderWidget();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Aging" }));
    expect(await screen.findByText(/12\.5h/)).toBeInTheDocument();
    expect(screen.getByText(/16h/)).toBeInTheDocument();
    expect(screen.getByText(/9d/)).toBeInTheDocument();
    expect(screen.getByText(/waiting 15d\+/)).toBeInTheDocument();
    expect(dashboardService.getAdminOverview).toHaveBeenCalledTimes(1);
    expect(dashboardService.getAdminPeople).not.toHaveBeenCalled();
  });

  it("Speed tab fetches people once and lists approvers", async () => {
    renderWidget();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Speed" }));
    expect(await screen.findByText("Ana Lee")).toBeInTheDocument();
    expect(screen.getByText("14.2h")).toBeInTheDocument();
    expect(dashboardService.getAdminPeople).toHaveBeenCalledTimes(1);
  });

  it("Speed tab shows an empty state when nobody decided anything", async () => {
    vi.mocked(dashboardService.getAdminPeople).mockResolvedValue(makePeople({ approver_sla: [] }));
    renderWidget();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Speed" }));
    expect(await screen.findByText("No decisions in the last 30 days")).toBeInTheDocument();
  });

  it("shows an error with a retry inside the tab when its request fails", async () => {
    vi.mocked(dashboardService.getAdminOverview).mockRejectedValueOnce(new Error("boom"));
    renderWidget();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Aging" }));
    const retry = await screen.findByRole("button", { name: /retry/i });
    fireEvent.click(retry);
    expect(await screen.findByText(/waiting 15d\+/)).toBeInTheDocument();
    // The tabs stay usable while one of them is in error.
    expect(screen.getByRole("tab", { name: "Status" })).toBeInTheDocument();
  });

  it("reuses one overview request when the Aging tab is reopened", async () => {
    renderWidget();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Aging" }));
    await screen.findByText(/waiting 15d\+/);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Status" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Aging" }));
    await screen.findByText(/waiting 15d\+/);
    expect(dashboardService.getAdminOverview).toHaveBeenCalledTimes(1);
  });
});
