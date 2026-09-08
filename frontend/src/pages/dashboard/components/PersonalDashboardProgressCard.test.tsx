import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalDashboardProgressCard } from "./PersonalDashboardProgressCard";

vi.mock("@/components/dashboard/ProgressRing", () => ({
  ProgressRing: ({ label }: { label: string }) => <div>{label}</div>,
}));

describe("PersonalDashboardProgressCard", () => {
  it("uses a shared GlassCard surface and tabular numeric summaries", () => {
    const { container } = render(
      <PersonalDashboardProgressCard
        overtimeProgress={40}
        leaveProgress={20}
        personalStandbyHours={2.5}
        pendingLeaveDays={1}
      />
    );

    expect(screen.getByText("My Progress")).toBeInTheDocument();
    expect(container.querySelector(".bg-gradient-to-br")).toBeNull();
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(2);
  });
});
