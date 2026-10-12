import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen } from "@testing-library/react";
import { Pencil, Trash2 } from "lucide-react";
import { RowActions } from "./RowActions";
import { RowActionsPill } from "./RowActionsPill";

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

  it("idles quiet and gives each tone a matching hover well", () => {
    render(
      <RowActions
        actions={[
          { label: "Edit", icon: Pencil, onClick: vi.fn() },
          { label: "Delete", icon: Trash2, onClick: vi.fn(), tone: "danger" },
          { label: "Rotate", icon: Pencil, onClick: vi.fn(), tone: "warning" },
          { label: "Approve", icon: Pencil, onClick: vi.fn(), tone: "success" },
        ]}
      />
    );
    const cls = (name: string) => screen.getByRole("button", { name }).className;
    expect(cls("Edit")).toContain("text-muted-foreground");
    expect(cls("Edit")).toContain("hover:bg-muted");
    expect(cls("Delete")).toContain("hover:bg-tone-danger-surface");
    expect(cls("Rotate")).toContain("hover:bg-tone-warning-surface");
    expect(cls("Approve")).toContain("hover:bg-tone-success-surface");
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

  it("the pointer-fine variant is defined (hover-reveal is dead without it)", () => {
    // Regression: Tailwind v4 drops unknown variants silently, so
    // `pointer-fine:opacity-0` never applied and column-mode actions were
    // always visible. The variant must exist in the stylesheet.
    const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "index.css");
    expect(readFileSync(cssPath, "utf-8")).toContain("@custom-variant pointer-fine");
  });

  it("shortLabel renders only inside the pill, hidden below xl", () => {
    // AdminTABLE mockup: the floating pill carries text labels on wide
    // screens (icon-only below xl); the actions column stays icon-only.
    const actions = [
      { label: "Edit user alice", shortLabel: "Edit", icon: Pencil, onClick: vi.fn() },
    ];
    const { unmount } = render(
      <RowActionsPill>
        <RowActions actions={actions} />
      </RowActionsPill>
    );
    const pillLabel = screen.getByText("Edit", { selector: "span" });
    expect(pillLabel.className).toContain("hidden");
    expect(pillLabel.className).toContain("xl:inline");
    unmount();
    render(<RowActions actions={actions} />);
    expect(screen.queryByText("Edit", { selector: "span" })).not.toBeInTheDocument();
  });
});
