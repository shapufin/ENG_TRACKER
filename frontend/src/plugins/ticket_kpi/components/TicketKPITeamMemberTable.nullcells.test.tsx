import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TicketKPITeamMemberTable } from "./TicketKPITeamMemberTable";
import type { TeamMemberRow } from "../utils/teamCSVExport";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const member = (overrides: Record<string, unknown>) =>
  ({
    id: 1,
    name: "Alice Doe",
    total_tickets: 0,
    fields_populated: [],
    ...overrides,
  }) as unknown as TeamMemberRow;

describe("TicketKPITeamMemberTable empty metrics", () => {
  it("shows N/A, not the text null, when the API sends null for resolution and SLA", () => {
    render(
      <TicketKPITeamMemberTable
        members={[member({ avg_resolution_hours: null, sla_compliance_pct: null })]}
        selectedMonth="2026-11"
      />
    );

    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
    expect(screen.getAllByText("N/A")).toHaveLength(2);
  });

  it("still formats real values", () => {
    render(
      <TicketKPITeamMemberTable
        members={[member({ avg_resolution_hours: 3.5, sla_compliance_pct: 91 })]}
        selectedMonth="2026-11"
      />
    );

    expect(screen.getByText("3.5h")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });
});
