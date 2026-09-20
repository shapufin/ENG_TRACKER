import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardSectionShell } from "./DashboardSectionShell";

describe("DashboardSectionShell", () => {
  it("renders title, subtitle, badge, and controls slots", () => {
    render(
      <DashboardSectionShell
        title="Queue Highlights"
        subtitle="Review time-sensitive items"
        badge={<span>Action Required</span>}
        controls={<button type="button">Batch Approve</button>}
      >
        <div>Card A</div>
      </DashboardSectionShell>
    );

    expect(screen.getByText("Queue Highlights")).toBeInTheDocument();
    expect(screen.getByText("Review time-sensitive items")).toBeInTheDocument();
    expect(screen.getByText("Action Required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Batch Approve" })).toBeInTheDocument();
    expect(screen.getByText("Card A")).toBeInTheDocument();
  });

  it("omits optional slots and allows a body class override", () => {
    const { container } = render(
      <DashboardSectionShell title="Plain" bodyClassName="flex flex-col">
        <div>Only</div>
      </DashboardSectionShell>
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const body = screen.getByText("Only").parentElement;
    expect(body?.className).toContain("flex-col");
    expect(container.querySelector("h3")).toHaveTextContent("Plain");
  });
});
