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
  it("renders on a non-hover-lift GlassCard surface", () => {
    // A selection bar must sit flat (isHoverLift={false}): no hover translate
    // or lift shadow, matching the filter-bar convention.
    const { container } = renderBar();

    const glassSurface = container.querySelector(".mb-4");
    expect(glassSurface).toBeInTheDocument();
    expect(glassSurface?.className).toContain("shadow-glass");
    expect(glassSurface?.className).not.toContain("hover:-translate-y-1");
  });

  it("labels every action button accessibly", () => {
    renderBar();

    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });
});
