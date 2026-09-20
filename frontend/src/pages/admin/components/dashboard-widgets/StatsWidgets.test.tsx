import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsWidgets } from "./StatsWidgets";

describe("StatsWidgets", () => {
  it("renders all active widgets", () => {
    render(
      <StatsWidgets
        isWidgetActive={() => true}
        totalUsers={10}
        totalTeams={5}
        totalPending={3}
        overtimeSummary={{ total_hours: 20 }}
      />
    );
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("Total Teams")).toBeInTheDocument();
    expect(screen.getByText("Pending Approvals")).toBeInTheDocument();
    expect(screen.getByText("Overtime Hours")).toBeInTheDocument();
  });

  it("renders no pending trend when zero", () => {
    render(
      <StatsWidgets
        isWidgetActive={(id) => id === "pending-approvals"}
        totalUsers={0}
        totalTeams={0}
        totalPending={0}
        overtimeSummary={null}
      />
    );
    expect(screen.getByText("No pending items")).toBeInTheDocument();
  });

  it("renders empty when widgets inactive", () => {
    const { container } = render(
      <StatsWidgets isWidgetActive={() => false} totalUsers={0} totalTeams={0} totalPending={0} />
    );
    expect(container.firstChild?.childNodes.length).toBe(0);
  });

  it("uses the shared ui/StatCard surface (no gradient icon boxes)", () => {
    const { container } = render(
      <StatsWidgets
        isWidgetActive={() => true}
        totalUsers={10}
        totalTeams={5}
        totalPending={3}
        overtimeSummary={{ total_hours: 20 }}
      />
    );
    expect(container.querySelector(".bg-gradient-to-br")).toBeNull();
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(4);
  });

  it("wraps each stat icon in a tinted well (StatCard's h-10/w-10 well wrapper)", () => {
    const { container } = render(
      <StatsWidgets
        isWidgetActive={() => true}
        totalUsers={10}
        totalTeams={5}
        totalPending={3}
        overtimeSummary={{ total_hours: 20 }}
      />
    );
    // Bare (well-less) icons render at h-8/w-8 with no wrapper div — the
    // h-10/w-10 rounded-xl wrapper only appears when iconWellClass is set.
    expect(container.querySelectorAll(".h-10.w-10.rounded-xl").length).toBe(4);
  });

  it("renders footer strips with real widget values", () => {
    const { container } = render(
      <StatsWidgets
        isWidgetActive={() => true}
        totalUsers={10}
        totalTeams={5}
        totalPending={3}
        overtimeSummary={{ total_hours: 20 }}
      />
    );
    const footers = container.querySelectorAll('[data-testid="stat-card-footer"]');
    expect(footers.length).toBe(4);
    expect(screen.getByText("10 registered")).toBeInTheDocument();
    expect(screen.getByText("5 teams")).toBeInTheDocument();
    expect(screen.getByText("3 awaiting")).toBeInTheDocument();
    expect(screen.getByText("20h logged")).toBeInTheDocument();
  });
});
