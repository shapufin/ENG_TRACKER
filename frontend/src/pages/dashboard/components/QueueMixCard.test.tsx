import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueueMixCard } from "./QueueMixCard";

const segments = [
  { label: "Overtime", value: 2, percentage: 20, accent: "bg-primary" },
  { label: "Standby", value: 1, percentage: 10, accent: "bg-amber-500" },
  { label: "Leave", value: 7, percentage: 70, accent: "bg-emerald-500" },
];

describe("QueueMixCard", () => {
  it("renders total and segments", () => {
    render(<QueueMixCard pendingTotal={10} pendingStandby={1} queueSegments={segments} />);
    expect(screen.getByText("Queue Mix")).toBeInTheDocument();
    expect(screen.getByText("10 pending")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Overtime")).toBeInTheDocument();
    expect(screen.getByText("7 (70%)")).toBeInTheDocument();
  });

  it("renders full circle when no standby", () => {
    const { container } = render(
      <QueueMixCard pendingTotal={5} pendingStandby={0} queueSegments={segments} />
    );
    const circle = container.querySelector('[style*="conic-gradient"]');
    expect(circle).toBeInTheDocument();
    expect(circle?.getAttribute("style")).toContain("360deg");
  });
});
