import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamBulkOperationsPanel } from "./TeamBulkOperationsPanel";

function renderPanel() {
  return render(
    <TeamBulkOperationsPanel
      selectedCount={3}
      onClear={() => {}}
      onApprove={() => {}}
      onReject={() => {}}
      onDelete={() => {}}
      canManage
    />
  );
}

describe("TeamBulkOperationsPanel", () => {
  it("renders the selection count in foreground color, not 1:1 primary text on primary tint", () => {
    const { container } = renderPanel();

    const count = screen.getByText("3");
    expect(count.className).toContain("text-foreground");
    expect(count.className).not.toContain("text-primary");

    const pill = container.querySelector(".rounded-md");
    expect(pill?.className).not.toContain("text-primary");
  });

  it("renders on a flat non-hover-lift GlassCard", () => {
    const { container } = renderPanel();

    const card = container.querySelector("[class*='shadow-glass']");
    expect(card).toBeInTheDocument();
    expect(card?.className).not.toContain("hover:-translate-y-1");
  });

  it("labels every action button accessibly", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });
});
