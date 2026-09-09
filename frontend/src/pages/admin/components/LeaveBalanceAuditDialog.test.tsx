import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaveBalanceAuditDialog } from "./LeaveBalanceAuditDialog";
import type { LeaveBalance } from "@/types";

// Runtime delivers decimal strings despite the number-typed contract (DRF).
const balance = {
  id: 1,
  user: 7,
  user_name: "Elencio Mukaj",
  leave_type: "vacation",
  year: 2026,
  total_days: "22.0",
  used_days: "3.0",
  pending_days: "0.0",
  available_days: "14.0",
  effective_available_days: "14.0",
  is_carry_over: false,
  expires_at: null,
} as unknown as LeaveBalance;

const renderOpen = (overrides = {}) =>
  render(
    <LeaveBalanceAuditDialog
      balance={{ ...balance, ...overrides } as unknown as LeaveBalance}
      onClose={vi.fn()}
    />
  );

describe("LeaveBalanceAuditDialog (mockup VacationBalance pattern)", () => {
  it("shows the member card with real ratios from string decimals", () => {
    renderOpen();
    expect(screen.getByText("Elencio Mukaj")).toBeInTheDocument();
    expect(screen.getByText("14.00")).toBeInTheDocument();
    expect(screen.getByText("3.00")).toBeInTheDocument();
    expect(screen.getByText("0.00")).toBeInTheDocument();
    expect(screen.getByTestId("audit-progress-remaining")).toHaveStyle({ width: "64%" });
    expect(screen.getByTestId("audit-progress-used")).toHaveStyle({ width: "14%" });
    expect(screen.getByTestId("audit-progress-pending")).toHaveStyle({ width: "0%" });
  });

  it("shows the carry-over expiry from row data, never invented policy", () => {
    renderOpen({ is_carry_over: true, expires_at: "2026-03-31" });
    expect(screen.getByText("Carry-over balance.")).toBeInTheDocument();
    expect(screen.getByText(/Expires 31\/03\/2026\./)).toBeInTheDocument();
    expect(screen.queryByText(/statutory/i)).not.toBeInTheDocument();
  });

  it("clamps progress at 100% when usage exceeds the total", () => {
    renderOpen({ used_days: "30.0" });
    expect(screen.getByTestId("audit-progress-used")).toHaveStyle({ width: "100%" });
  });

  it("states no expiry when none is set", () => {
    renderOpen();
    expect(screen.getByText(/no expiry set/i)).toBeInTheDocument();
  });

  it("renders nothing when balance is null", () => {
    render(<LeaveBalanceAuditDialog balance={null} onClose={vi.fn()} />);
    expect(screen.queryByText("Allowance Audit")).not.toBeInTheDocument();
  });
});
