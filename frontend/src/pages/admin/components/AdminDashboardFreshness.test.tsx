import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminDashboardFreshness } from "./AdminDashboardFreshness";

let qc: QueryClient;
const renderIt = () =>
  render(
    <QueryClientProvider client={qc}>
      <AdminDashboardFreshness />
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
  qc = new QueryClient();
});
afterEach(() => vi.useRealTimers());

describe("AdminDashboardFreshness", () => {
  it("shows a dash when nothing has loaded", () => {
    renderIt();
    expect(screen.getByText("Updated —")).toBeInTheDocument();
  });

  it("shows how old the oldest dashboard data is", () => {
    qc.setQueryData(["admin", "overview"], {});
    vi.setSystemTime(new Date("2026-10-08T10:00:20Z"));
    renderIt();
    expect(screen.getByText("Updated just now")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000 + 30_000);
    });
    expect(screen.getByText("Updated 2m ago")).toBeInTheDocument();
  });

  it("ignores queries that are not dashboard queries", () => {
    qc.setQueryData(["admin", "users"], {});
    renderIt();
    expect(screen.getByText("Updated —")).toBeInTheDocument();
  });

  it("refresh invalidates the dashboard keys and blocks while fetching", () => {
    const spy = vi.spyOn(qc, "invalidateQueries");
    qc.setQueryData(["admin", "overview"], {});
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
    expect(keys).toContainEqual(["admin", "overview"]);
    expect(keys).not.toContainEqual(["admin"]);
  });
});

describe("AdminDashboardFreshness render safety", () => {
  it("does not update state while another component is rendering", async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => {
      errors.push(a);
    });
    const { useQuery } = await import("@tanstack/react-query");
    const Fetching = () => {
      useQuery({ queryKey: ["admin", "overview"], queryFn: () => Promise.resolve({}) });
      return null;
    };
    vi.useRealTimers();
    const tree = (withFetching: boolean) => (
      <QueryClientProvider client={qc}>
        <AdminDashboardFreshness />
        {withFetching && <Fetching />}
      </QueryClientProvider>
    );
    // Freshness is already subscribed when a (lazy) widget mounts later.
    const { rerender } = render(tree(false));
    rerender(tree(true));
    spy.mockRestore();
    expect(errors.filter((a) => String(a[0]).includes("Cannot update a component"))).toEqual([]);
  });
});
