import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApprovalActionsColumn } from "./ApprovalActionsColumn";

describe("ApprovalActionsColumn", () => {
  it("renders accessible approve/reject buttons for pending items", () => {
    render(<ApprovalActionsColumn status="pending" onApprove={vi.fn()} onReject={vi.fn()} />);
    // Icon-only buttons MUST have accessible names (audit 2026-09-07: they
    // rendered as unnamed "button, button" for screen readers).
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("renders a dash for non-pending status", () => {
    render(<ApprovalActionsColumn status="approved" onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
