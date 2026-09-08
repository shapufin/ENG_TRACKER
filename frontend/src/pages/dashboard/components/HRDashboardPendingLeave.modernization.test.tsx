import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRDashboardPendingLeave } from "./HRDashboardPendingLeave";

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

describe("HRDashboardPendingLeave modernization", () => {
  it("renders the shared icon-centered empty state when no requests are pending", () => {
    const { container } = render(<HRDashboardPendingLeave leaveData={{ results: [] }} />);

    expect(screen.getByText("All leave requests have been processed.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
