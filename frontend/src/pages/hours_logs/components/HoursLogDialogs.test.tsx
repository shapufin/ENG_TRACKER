import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RejectConfirmDialog } from "./HoursLogDialogs";

describe("RejectConfirmDialog", () => {
  it("exposes the reason field to assistive tech by name, not just placeholder", () => {
    render(
      <RejectConfirmDialog
        open
        onOpenChange={vi.fn()}
        rejectReason=""
        onRejectReasonChange={vi.fn()}
        onConfirm={vi.fn()}
        isConfirming={false}
      />
    );
    expect(screen.getByRole("textbox", { name: "Rejection reason" })).toBeInTheDocument();
  });
});
