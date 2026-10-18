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
    renderPanel();

    // The shared dock keeps the count in its AnimatedNumber badge (aria-label)
    // and the words in their own node — the contract pinned by the ticket_kpi
    // page test. Asserting on the words node, not a concatenated string.
    expect(screen.getByLabelText("3 selected")).toBeInTheDocument();
    const label = screen.getByText("items selected");
    expect(label.className).toContain("text-foreground");
    expect(label.className).not.toContain("text-primary");
  });

  it("delegates to the shared floating BulkActionBar without a one-sided accent border", () => {
    renderPanel();

    const bar = screen.getByRole("status");
    expect(bar).toBeInTheDocument();
    expect(bar.className).toContain("bg-popover/95");
    expect(bar.className).not.toContain("border-l-4");
    expect(bar.className).not.toContain("hover:-translate-y-1");
  });

  it("labels every action button accessibly", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear selection/i })).toBeInTheDocument();
  });
});
