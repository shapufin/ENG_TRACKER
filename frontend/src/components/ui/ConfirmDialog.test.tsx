import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("does not render when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="Delete?"
        description="Confirm delete"
        onConfirm={() => {}}
      />
    );
    expect(screen.queryByText("Delete?")).not.toBeInTheDocument();
  });

  it("renders and calls onConfirm when confirmed", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete?"
        description="Confirm delete"
        onConfirm={onConfirm}
      />
    );
    expect(screen.getByText("Delete?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button when confirmDisabled is true", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Reject request"
        onConfirm={onConfirm}
        confirmDisabled
        confirmLabel="Reject"
      />
    );
    const button = screen.getByRole("button", { name: "Reject" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
