import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TicketKPITeamMemberTable } from "./TicketKPITeamMemberTable";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";
import type { TeamMemberRow } from "../utils/teamCSVExport";

const members = [
  {
    id: 7,
    name: "Alice Doe",
    total_tickets: 12,
    avg_resolution_hours: 3.5,
    sla_compliance_pct: 91,
    fields_populated: [],
  },
] as unknown as TeamMemberRow[];

const phone = () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query === MOBILE_CARD_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
};

describe("TicketKPITeamMemberTable", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows each member as a card on phones and still opens the member on tap", () => {
    phone();
    const onMemberClick = vi.fn();
    render(
      <TicketKPITeamMemberTable
        members={members}
        selectedMonth="2026-11"
        onMemberClick={onMemberClick}
      />
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const card = screen.getByRole("button", { name: /Alice Doe/ });
    expect(within(card).getByText("Alice Doe")).toBeInTheDocument();
    expect(within(card).getByText("12")).toBeInTheDocument();
    expect(within(card).getByText("3.5h")).toBeInTheDocument();
    expect(within(card).getByText("91%")).toBeInTheDocument();

    fireEvent.click(card);
    expect(onMemberClick).toHaveBeenCalledWith(members[0]);
  });
});
