import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OtStandbyTrendWidget } from "./OtStandbyTrendWidget";
import { LeaveTrendWidget } from "./LeaveTrendWidget";
import { OtByClientWidget } from "./OtByClientWidget";
import { TeamComparisonWidget } from "./TeamComparisonWidget";
import { WhoIsOutWidget } from "./WhoIsOutWidget";
import { makeTrends } from "./adminFixtures";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 240 }}>{children}</div>
    ),
  };
});

const widgets = [
  ["OtStandbyTrendWidget", OtStandbyTrendWidget],
  ["LeaveTrendWidget", LeaveTrendWidget],
  ["OtByClientWidget", OtByClientWidget],
  ["TeamComparisonWidget", TeamComparisonWidget],
  ["WhoIsOutWidget", WhoIsOutWidget],
] as const;

describe.each(widgets)("%s shared states", (_name, Widget) => {
  it("shows a loading placeholder", () => {
    render(<Widget isLoading />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("shows an error with a retry", () => {
    const onRetry = vi.fn();
    render(<Widget isError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("OtStandbyTrendWidget", () => {
  it("summarises the latest month for assistive tech", () => {
    render(<OtStandbyTrendWidget data={makeTrends()} />);
    expect(
      screen.getByRole("img", { name: /latest month: 12\.5 hours overtime, 16 hours standby/i })
    ).toBeInTheDocument();
  });

  it("shows an empty state when every month is zero", () => {
    const zero = Array(12).fill(0);
    render(
      <OtStandbyTrendWidget
        data={makeTrends({ hours: { overtime: zero, standby: zero, pending_overtime: zero } })}
      />
    );
    expect(screen.getByText("No hours yet")).toBeInTheDocument();
  });
});

describe("LeaveTrendWidget", () => {
  it("shows an empty state with no approved leave", () => {
    render(<LeaveTrendWidget data={makeTrends()} />);
    expect(screen.getByText("No approved leave yet")).toBeInTheDocument();
  });

  it("renders the chart when there is leave", () => {
    const v = Array(12).fill(0);
    v[11] = 4;
    render(
      <LeaveTrendWidget
        data={makeTrends({ leave_days: { vacation: v, sick: Array(12).fill(0) } })}
      />
    );
    expect(screen.getByRole("img", { name: /4 vacation/i })).toBeInTheDocument();
  });
});

describe("OtByClientWidget", () => {
  it("lists clients with hours and share, Other last", () => {
    render(<OtByClientWidget data={makeTrends()} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Acme");
    expect(items[0]).toHaveTextContent("10h · 80%");
    expect(items[1]).toHaveTextContent("Other");
  });

  it("shows an empty state with no overtime", () => {
    render(<OtByClientWidget data={makeTrends({ overtime_by_client: [] })} />);
    expect(screen.getByText("No overtime this month")).toBeInTheDocument();
  });
});

describe("TeamComparisonWidget", () => {
  it("renders null per-capita as a dash, never NaN or Infinity", () => {
    render(<TeamComparisonWidget data={makeTrends()} />);
    const row = screen.getByRole("row", { name: /Empty/ });
    expect(row).toHaveTextContent("—");
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    expect(screen.getByRole("row", { name: /Core/ })).toHaveTextContent("5");
  });

  it("shows an empty state with no teams", () => {
    render(<TeamComparisonWidget data={makeTrends({ team_comparison: [] })} />);
    expect(screen.getByText("No teams yet")).toBeInTheDocument();
  });
});

describe("WhoIsOutWidget", () => {
  it("shows leave with the end date and standby, plus the upcoming count", () => {
    render(<WhoIsOutWidget data={makeTrends()} />);
    expect(screen.getByText(/Ana Lee · Core/)).toBeInTheDocument();
    expect(screen.getByText("until 2026-10-10")).toBeInTheDocument();
    expect(screen.getByText("Bo Kim")).toBeInTheDocument();
    expect(screen.getByText(/3 more starting leave in the next 14 days/)).toBeInTheDocument();
  });

  it("shows an empty state when nobody is out", () => {
    const base = makeTrends();
    render(
      <WhoIsOutWidget
        data={makeTrends({ who_is_out: { ...base.who_is_out, on_leave: [], on_standby: [] } })}
      />
    );
    expect(screen.getByText("Nobody is out today")).toBeInTheDocument();
  });

  it("notes truncation when a list is capped", () => {
    const base = makeTrends();
    const many = Array.from({ length: 20 }, (_, i) => ({
      user_id: i,
      name: `P${i}`,
      team: null,
      request_type: "vacation",
      until: "2026-10-10",
    }));
    render(
      <WhoIsOutWidget data={makeTrends({ who_is_out: { ...base.who_is_out, on_leave: many } })} />
    );
    expect(screen.getByText(/Showing the first 20 per list/)).toBeInTheDocument();
  });
});
