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

    const bar = screen.getByRole("status");
    expect(bar.className).toContain("flex-wrap");
  });
});

describe("BulkActionBar surface", () => {
  it("renders as a floating bottom dock with semantic popover tokens", () => {
    renderBar();

    const bar = screen.getByRole("status");
    expect(bar).toBeInTheDocument();
    expect(bar.className).toContain("rounded-2xl");
    expect(bar.className).toContain("bg-popover/95");
    expect(bar.className).toContain("shadow-pop");
    expect(bar.className).not.toContain("hover:-translate-y-1");
    expect(bar.className).not.toContain("border-l-4");
    expect(bar.parentElement?.className).toContain("fixed");
    expect(bar.parentElement?.className).toContain("bottom-5");
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
