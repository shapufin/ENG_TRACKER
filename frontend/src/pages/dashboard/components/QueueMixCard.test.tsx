import type React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueueMixCard } from "./QueueMixCard";

const segments = [
  { label: "Overtime", value: 2, percentage: 20, accent: "bg-primary" },
  { label: "Standby", value: 1, percentage: 10, accent: "bg-amber-500" },
  { label: "Leave", value: 7, percentage: 70, accent: "bg-emerald-500" },
];

const renderCard = (props: Partial<React.ComponentProps<typeof QueueMixCard>> = {}) =>
  render(
    <MemoryRouter>
      <QueueMixCard pendingTotal={10} queueSegments={segments} {...props} />
    </MemoryRouter>
  );

describe("QueueMixCard", () => {
  it("renders total and segments", () => {
    renderCard();
    expect(screen.getByText("Queue Mix")).toBeInTheDocument();
    expect(screen.getByText("10 pending")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Overtime")).toBeInTheDocument();
    expect(screen.getByText("7 (70%)")).toBeInTheDocument();
  });

  it("renders all three segments in the donut gradient", () => {
    const { container } = renderCard();
    const circle = container.querySelector('[style*="conic-gradient"]');
    expect(circle).toBeInTheDocument();
    const style = circle?.getAttribute("style") ?? "";
    expect(style).toContain("hsl(var(--chart-1))");
    expect(style).toContain("hsl(var(--chart-3))");
    expect(style).toContain("hsl(var(--chart-2))");
  });

  it("renders a muted circle when the queue is empty", () => {
    const { container } = render(
      <MemoryRouter>
        <QueueMixCard pendingTotal={0} queueSegments={[]} />
      </MemoryRouter>
    );
    const circle = container.querySelector('[role="img"] > div');
    expect(circle).toBeInTheDocument();
    expect(circle?.getAttribute("style")).toContain("hsl(var(--muted))");
    expect(container.querySelector('[role="img"]')).toHaveAttribute(
      "aria-label",
      expect.stringContaining("No pending requests")
    );
  });

  it("renders the compliance note and a Batch Assign link", () => {
    renderCard();
    expect(screen.getByText("Compliant with Work Regulations 2024")).toBeInTheDocument();
    expect(screen.getByText("Batch Assign")).toBeInTheDocument();
  });
});
