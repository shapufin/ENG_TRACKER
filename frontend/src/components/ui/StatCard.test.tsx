import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Clock } from "lucide-react";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders the label, value, and icon", () => {
    const { container } = render(<StatCard label="Total hours" value={42} icon={Clock} />);

    expect(screen.getByText("Total hours")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders numeric values with tabular-nums and the mono font so digits align across cards", () => {
    const { container } = render(<StatCard label="Total hours" value={1234} icon={Clock} />);

    const value = screen.getByText("1234");
    expect(value.className).toContain("tabular-nums");
    expect(value.className).toContain("font-mono");
  });

  it("renders an accessible status dot when a status label is provided", () => {
    render(<StatCard label="Active users" value={7} icon={Clock} statusDotLabel="All active" />);

    const dot = screen.getByRole("status", { name: "All active" });
    expect(dot).toBeInTheDocument();
  });

  it("renders no status dot when no status label is provided", () => {
    render(<StatCard label="Active users" value={7} icon={Clock} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders an optional progress bar (TL-flavored stat cards) with the given percent and color", () => {
    const { container } = render(
      <StatCard
        label="Total Hours"
        value={12}
        icon={Clock}
        progressPercent={45}
        progressColorClass="bg-indigo-500"
      />
    );

    const fill = container.querySelector('[data-testid="stat-card-progress-fill"]');
    expect(fill).toBeInTheDocument();
    expect(fill).toHaveStyle({ width: "45%" });
    expect(fill?.className).toContain("bg-indigo-500");
  });

  it("renders no progress bar when progressPercent is not provided", () => {
    const { container } = render(<StatCard label="Active users" value={7} icon={Clock} />);

    expect(
      container.querySelector('[data-testid="stat-card-progress-fill"]')
    ).not.toBeInTheDocument();
  });

  it("wraps the icon in a tinted well when iconWellClass is provided", () => {
    const { container } = render(
      <StatCard label="Pending OT" value={2} icon={Clock} iconWellClass="bg-accent-orange/10" />
    );

    const well = container.querySelector("div.bg-accent-orange\\/10");
    expect(well).not.toBeNull();
    expect(well?.querySelector("svg")).toBeInTheDocument();
  });

  it("keeps the icon bare (no well) when iconWellClass is omitted", () => {
    const { container } = render(<StatCard label="Active users" value={7} icon={Clock} />);

    // The icon renders directly without a wrapping tinted container.
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.parentElement?.className).not.toContain("rounded-xl");
  });
});
