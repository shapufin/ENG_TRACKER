import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Pencil, Trash2 } from "lucide-react";
import { RowActions } from "./RowActions";

describe("RowActions", () => {
  it("each action is a labelled button", () => {
    const onEdit = vi.fn();
    render(
      <RowActions
        actions={[
          { label: "Edit user alice", icon: Pencil, onClick: onEdit },
          { label: "Delete user alice", icon: Trash2, onClick: vi.fn() },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit user alice" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Delete user alice" })).toBeInTheDocument();
  });

  it("hover reveal classes include pointer-fine, focus-within and selected variants", () => {
    const { container } = render(
      <RowActions actions={[{ label: "Edit", icon: Pencil, onClick: vi.fn() }]} />
    );
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("pointer-fine:opacity-0");
    expect(cls).toContain("pointer-fine:group-hover/row:opacity-100");
    expect(cls).toContain("pointer-fine:group-focus-within/row:opacity-100");
    expect(cls).toContain("pointer-fine:group-data-[state=selected]/row:opacity-100");
  });

  it('reveal="always" has no opacity-0', () => {
    const { container } = render(
      <RowActions reveal="always" actions={[{ label: "Edit", icon: Pencil, onClick: vi.fn() }]} />
    );
    expect((container.firstElementChild as HTMLElement).className).not.toContain("opacity-0");
  });

  it("danger tone uses text-destructive", () => {
    render(
      <RowActions actions={[{ label: "Delete", icon: Trash2, onClick: vi.fn(), tone: "danger" }]} />
    );
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("text-destructive");
  });

  it("disabled action is disabled", () => {
    render(
      <RowActions actions={[{ label: "Edit", icon: Pencil, onClick: vi.fn(), disabled: true }]} />
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });

  it("disabled action with disabledReason has an accessible description", () => {
    render(
      <RowActions
        actions={[
          {
            label: "Edit 1",
            icon: Pencil,
            onClick: vi.fn(),
            disabled: true,
            disabledReason: "Locked reason",
          },
        ]}
      />
    );
    const btn = screen.getByRole("button", { name: "Edit 1" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("Locked reason");
  });
});
