import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApprovalActionsWithView } from "./ApprovalActionsWithView";

describe("ApprovalActionsWithView", () => {
  it("renders inline Approve/Reject plus a labeled View action for pending rows", () => {
    render(
      <ApprovalActionsWithView
        status="pending"
        itemLabel="alice"
        onView={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Approve alice" })).toHaveTextContent("Approve");
    expect(screen.getByRole("button", { name: "Reject alice" })).toHaveTextContent("Reject");
    expect(screen.getByRole("button", { name: "View details for alice" })).toBeInTheDocument();
  });

  it("calls through without any dialog", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ApprovalActionsWithView
        status="pending"
        itemLabel="alice"
        onView={vi.fn()}
        onApprove={onApprove}
        onReject={onReject}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve alice" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Reject alice" }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders a dash for decided rows", () => {
    render(
      <ApprovalActionsWithView
        status="approved"
        itemLabel="alice"
        onView={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Approve alice" })).not.toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
