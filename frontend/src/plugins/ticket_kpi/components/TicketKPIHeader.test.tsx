import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TicketKPIHeader } from "./TicketKPIHeader";

const baseProps = {
  selectedMonth: "2026-03-01",
  onMonthChange: vi.fn(),
  onUpload: vi.fn(),
  onBack: vi.fn(),
};

describe("TicketKPIHeader", () => {
  it("offers Import Tickets on the user's own dashboard", () => {
    render(<TicketKPIHeader {...baseProps} isFilteredView={false} />);
    expect(screen.getByRole("button", { name: /import tickets/i })).toBeInTheDocument();
  });

  it("hides the import button while someone who may not import views a member", () => {
    render(<TicketKPIHeader {...baseProps} isFilteredView memberName="Ana" />);
    expect(screen.queryByRole("button", { name: /import/i })).not.toBeInTheDocument();
  });

  it("offers Import for member to a leader viewing a member", () => {
    render(<TicketKPIHeader {...baseProps} isFilteredView memberName="Ana" canImportForMember />);
    expect(screen.getByRole("button", { name: /import for member/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /import tickets/i })).not.toBeInTheDocument();
  });
});
