import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PIPListPanel } from "./PIPListPanel";
import type { PIPRecord } from "../types/tlScorecard";

const PENDING: PIPRecord = {
  id: 1, employee: 20, employee_name: "Jane Doe", tl: 1, tl_name: "Leader",
  status: "active", start_date: "2026-09-01", approved_by: null, approved_by_name: null,
  approved_at: null, notes: "",
};

const APPROVED: PIPRecord = { ...PENDING, id: 2, approved_by: 5, approved_by_name: "HR Person", approved_at: "2026-09-10T00:00:00Z" };

describe("PIPListPanel", () => {
  it("shows an empty state with no records", () => {
    render(<PIPListPanel records={[]} canApprove={false} onApprove={vi.fn()} isApproving={false} />);
    expect(screen.getByText("No PIPs open")).toBeInTheDocument();
  });

  it("shows Pending (not an Approve button) for a non-admin viewer", () => {
    render(<PIPListPanel records={[PENDING]} canApprove={false} onApprove={vi.fn()} isApproving={false} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("lets an admin approve a pending PIP", () => {
    const onApprove = vi.fn();
    render(<PIPListPanel records={[PENDING]} canApprove onApprove={onApprove} isApproving={false} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledWith(1);
  });

  it("shows Approved status once approved_at is set, even for an admin", () => {
    render(<PIPListPanel records={[APPROVED]} canApprove onApprove={vi.fn()} isApproving={false} />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });
});
