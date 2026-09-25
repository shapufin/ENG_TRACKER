import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LogReviewDeliveryDialog } from "./LogReviewDeliveryDialog";

describe("LogReviewDeliveryDialog", () => {
  it("disables submit until a recipient is entered", () => {
    render(<LogReviewDeliveryDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /log delivery/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "Ops" } });
    expect(screen.getByRole("button", { name: /log delivery/i })).not.toBeDisabled();
  });

  it("rejects a malformed period and keeps submit disabled", () => {
    render(<LogReviewDeliveryDialog open onOpenChange={() => {}} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "Ops" } });
    fireEvent.change(screen.getByLabelText("Period (YYYY-MM)"), { target: { value: "not-a-period" } });
    expect(screen.getByRole("button", { name: /log delivery/i })).toBeDisabled();
  });

  it("submits period, recipient, and delivered_on", () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<LogReviewDeliveryDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText("Period (YYYY-MM)"), { target: { value: "2026-09" } });
    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "Ops" } });
    fireEvent.change(screen.getByLabelText("Delivered on"), { target: { value: "2026-09-15" } });
    fireEvent.click(screen.getByRole("button", { name: /log delivery/i }));

    expect(onCreate).toHaveBeenCalledWith({ period: "2026-09", recipient: "Ops", delivered_on: "2026-09-15" });
  });
});
