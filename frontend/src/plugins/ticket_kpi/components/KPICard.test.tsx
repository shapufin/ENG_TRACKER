import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KPICard } from "./KPICard";
import { Users } from "lucide-react";

describe("KPICard", () => {
  it("renders title, value, subtitle, and icon in the shared stat card", () => {
    render(<KPICard title="Total" value={42} subtitle="This month" icon={Users} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("This month")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeInTheDocument();
    expect(document.querySelector(".shadow-glass")).toBeInTheDocument();
    expect(screen.getByText("42")).toHaveClass("tabular-nums");
  });

  it("does not render a delta badge when delta is undefined", () => {
    render(<KPICard title="Total" value={42} subtitle="This month" icon={Users} />);
    expect(screen.queryByText("+5")).not.toBeInTheDocument();
  });

  it("renders a positive delta badge (green for higher-is-better)", () => {
    render(
      <KPICard
        title="Total"
        value={42}
        subtitle="This month"
        icon={Users}
        delta={5}
        deltaLabel="vs last month"
      />
    );
    const badge = screen.getByText("+5");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("span")).toHaveClass("text-tone-success-text");
  });

  it("renders a negative delta as red for higher-is-better metrics", () => {
    render(
      <KPICard
        title="SLA"
        value={80}
        subtitle="This month"
        icon={Users}
        delta={-5}
        deltaLabel="vs last month"
      />
    );
    const badge = screen.getByText("-5");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("span")).toHaveClass("text-tone-danger-text");
  });

  it("renders a negative delta as green for lower-is-better metrics (resolution time)", () => {
    render(
      <KPICard
        title="Avg Resolution"
        value="6h"
        subtitle="Per ticket"
        icon={Users}
        delta={-2}
        deltaLabel="vs last month"
        lowerIsBetter
      />
    );
    const badge = screen.getByText("-2");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("span")).toHaveClass("text-tone-success-text");
  });

  it("renders zero delta as neutral", () => {
    render(
      <KPICard
        title="Total"
        value={42}
        subtitle="This month"
        icon={Users}
        delta={0}
        deltaLabel="vs last month"
      />
    );
    const badge = screen.getByText("0");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("span")).toHaveClass("text-muted-foreground");
  });

  it("does not render a badge when delta is null", () => {
    render(
      <KPICard
        title="Total"
        value={42}
        subtitle="This month"
        icon={Users}
        delta={null}
        deltaLabel="vs last month"
      />
    );
    expect(screen.queryByText("+0")).not.toBeInTheDocument();
  });
});
