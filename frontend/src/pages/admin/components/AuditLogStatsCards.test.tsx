import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuditLogStatsCards } from "./AuditLogStatsCards";

describe("AuditLogStatsCards", () => {
  it("renders all stats", () => {
    render(
      <AuditLogStatsCards
        stats={{ total_logs: 1000, logs_today: 5, unique_users: 10, failed_actions: 2 }}
      />
    );
    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders defaults when stats is null", () => {
    render(<AuditLogStatsCards stats={null} />);
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(4);
  });

  it("renders skeletons when isLoading is true", () => {
    const { container } = render(<AuditLogStatsCards stats={null} isLoading={true} />);
    // Skeletons use animate-pulse; verify they render instead of stat values.
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(4);
    // The "0" defaults should NOT appear while loading.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders stat values with tabular-nums on the shared StatCard", () => {
    const { container } = render(
      <AuditLogStatsCards
        stats={{ total_logs: 1000, logs_today: 5, unique_users: 10, failed_actions: 2 }}
      />
    );
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(4);
  });
});
