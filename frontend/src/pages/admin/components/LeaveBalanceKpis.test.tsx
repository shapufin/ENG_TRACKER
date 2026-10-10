import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveBalanceKpis } from "./LeaveBalanceKpis";

const totals = { allocated: 34, used: 10, pending: 3, atRisk: 3, usedPct: 29 };

describe("LeaveBalanceKpis", () => {
  it("shows the totals in days with the used percentage", () => {
    render(<LeaveBalanceKpis totals={totals} expiringOnly={false} onToggleExpiring={vi.fn()} />);
    expect(screen.getByText("34d")).toBeInTheDocument();
    expect(screen.getByText("10d")).toBeInTheDocument();
    expect(screen.getByText("29% of allocated")).toBeInTheDocument();
    expect(screen.getByText("Carry-over at risk")).toBeInTheDocument();
  });

  it("omits the percentage when nothing is allocated", () => {
    render(
      <LeaveBalanceKpis
        totals={{ allocated: 0, used: 0, pending: 0, atRisk: 0, usedPct: null }}
        expiringOnly={false}
        onToggleExpiring={vi.fn()}
      />
    );
    expect(screen.queryByText(/of allocated/)).not.toBeInTheDocument();
  });

  it("clicking the at-risk card toggles the expiring filter", () => {
    const onToggle = vi.fn();
    render(<LeaveBalanceKpis totals={totals} expiringOnly={false} onToggleExpiring={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /carry-over at risk/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
