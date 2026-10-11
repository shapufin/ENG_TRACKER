import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BulkActionBar } from "./BulkActionBar";
import { Check, X } from "lucide-react";

function renderBar() {
  return render(
    <BulkActionBar
      selectedCount={3}
      entityName="items"
      onClear={() => {}}
      actions={[
        { label: "Approve", icon: Check, onClick: () => {} },
        { label: "Reject", icon: X, onClick: () => {}, variant: "destructive" },
      ]}
    />
  );
}

describe("BulkActionBar mobile responsiveness", () => {
  it("wraps action buttons on small screens", () => {
    renderBar();

    const selectedText = screen.getByText("items selected");
    const outerBar = selectedText.parentElement?.parentElement;
    expect(outerBar?.className).toContain("flex-wrap");
  });
});

describe("BulkActionBar surface", () => {
  it("renders as a flat selection strip, not a lift surface", () => {
    // A selection bar must sit flat (no `interactive`): no hover translate or
    // lift shadow, matching the filter-bar convention. The 2026-10-10 refinement
    // also dropped the GlassCard + accent-border treatment for one quiet band.
    const { container } = renderBar();

    const bar = container.querySelector(".mb-4");
    expect(bar).toBeInTheDocument();
    expect(bar?.className).toContain("rounded-lg");
    expect(bar?.className).toContain("bg-muted/40");
    expect(bar?.className).not.toContain("hover:-translate-y-1");
    expect(bar?.className).not.toContain("border-l-4");
  });

  it("labels every action button accessibly", () => {
    renderBar();

    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear selection/i })).toBeInTheDocument();
  });

  it("keeps the animated gradient count badge (never a flat circle)", () => {
    renderBar();
    const badge = screen.getByLabelText("3 selected");
    expect(badge.className).toContain("bg-linear-to-br");
    expect(badge.className).toContain("from-accent-violet");
    // AnimatedNumber springs from 0, so only the shape of the value is stable
    // at first paint; the pinning here is the gradient, not the digit.
    expect(badge.textContent).toMatch(/^\d+$/);
  });
});
