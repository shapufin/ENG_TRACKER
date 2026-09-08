import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TLApprovalStats } from "./TLApprovalStats";

describe("TLApprovalStats", () => {
  it("renders counts for all three types", () => {
    render(
      <TLApprovalStats
        overtimeCount={5}
        standbyCount={3}
        leaveCount={2}
        isLoading={{ overtime: false, standby: false, leave: false }}
      />
    );
    expect(screen.getByText("Overtime")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Standby")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Leave")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(
      <TLApprovalStats
        overtimeCount={0}
        standbyCount={0}
        leaveCount={0}
        isLoading={{ overtime: true, standby: true, leave: true }}
      />
    );
    expect(screen.getAllByText("...")).toHaveLength(3);
  });

  it("does not call onCardClick when no pending months available", () => {
    const onCardClick = vi.fn();
    render(
      <TLApprovalStats
        overtimeCount={0}
        standbyCount={0}
        leaveCount={0}
        isLoading={{ overtime: false, standby: false, leave: false }}
        pendingMonths={{ overtime: [], standby: [], leave: [] }}
        onCardClick={onCardClick}
      />
    );
    // Cards should not be clickable
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onCardClick with the correct type when a card with pending months is clicked", () => {
    const onCardClick = vi.fn();
    const { container } = render(
      <TLApprovalStats
        overtimeCount={5}
        standbyCount={0}
        leaveCount={0}
        isLoading={{ overtime: false, standby: false, leave: false }}
        pendingMonths={{
          overtime: [{ month: "2026-03-01", count: 5 }],
          standby: [],
          leave: [],
        }}
        onCardClick={onCardClick}
      />
    );
    // The overtime card should be clickable (role=button)
    const overtimeCard = container.querySelector('[role="button"]');
    expect(overtimeCard).toBeInTheDocument();
    fireEvent.click(overtimeCard!);
    expect(onCardClick).toHaveBeenCalledWith("overtime");
  });

  it("displays the total count passed from parent (sum across all months)", () => {
    // The parent (TLApprovalDashboard) sums pendingMonths counts and passes
    // the total here. This test verifies the component displays whatever
    // total count it receives, not just the current-month filtered count.
    render(
      <TLApprovalStats
        overtimeCount={7}
        standbyCount={3}
        leaveCount={0}
        isLoading={{ overtime: false, standby: false, leave: false }}
        pendingMonths={{
          overtime: [
            { month: "2026-01-01", count: 2 },
            { month: "2026-03-01", count: 5 },
          ],
          standby: [{ month: "2026-02-01", count: 3 }],
          leave: [],
        }}
        onCardClick={vi.fn()}
      />
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows 'click to jump' hint when pending months exist", () => {
    render(
      <TLApprovalStats
        overtimeCount={5}
        standbyCount={0}
        leaveCount={0}
        isLoading={{ overtime: false, standby: false, leave: false }}
        pendingMonths={{
          overtime: [{ month: "2026-03-01", count: 5 }],
          standby: [],
          leave: [],
        }}
        onCardClick={vi.fn()}
      />
    );
    expect(screen.getByText("Pending · click to jump")).toBeInTheDocument();
  });
});
