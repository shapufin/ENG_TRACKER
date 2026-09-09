import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

const base = {
  open: true,
  onOpenChange: () => {},
  title: "Delete entry?",
  description: "This cannot be undone.",
  onConfirm: () => {},
} as const;

describe("ConfirmDialog variants (mockup ConfirmAction pattern)", () => {
  it("destructive variant renders a destructive button", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...base} onConfirm={onConfirm} variant="destructive" />);
    const btn = screen.getByRole("button", { name: "Confirm" });
    expect(btn.className).toContain("bg-destructive");
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("success variant reuses the default button (no new Button variant)", () => {
    render(<ConfirmDialog {...base} variant="success" confirmLabel="Approve" />);
    const btn = screen.getByRole("button", { name: "Approve" });
    expect(btn.className).toContain("bg-primary");
    expect(btn.className).not.toContain("bg-destructive");
  });

  it("renders the icon slot next to the title", () => {
    render(
      <ConfirmDialog {...base} variant="destructive" icon={<span data-testid="ctx-icon">!</span>} />
    );
    expect(screen.getByTestId("ctx-icon")).toBeInTheDocument();
    expect(screen.getByText("Delete entry?")).toBeInTheDocument();
  });

  it("renders no icon container when icon is omitted", () => {
    const { container } = render(<ConfirmDialog {...base} />);
    expect(container.querySelector("[data-testid='confirm-icon-well']")).not.toBeInTheDocument();
  });

  it("renders contextSlot between description and children", () => {
    render(
      <ConfirmDialog {...base} contextSlot={<div data-testid="ctx-slot">3.5h by Aldair</div>}>
        <div data-testid="reason-child">reason field</div>
      </ConfirmDialog>
    );
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-slot")).toBeInTheDocument();
    expect(screen.getByTestId("reason-child")).toBeInTheDocument();
  });
});
