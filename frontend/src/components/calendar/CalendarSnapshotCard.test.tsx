import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarSnapshotCard } from "./CalendarSnapshotCard";

const formatDays = (v: number) => String(v);

const baseSummary = {
  remainingDays: 16,
  usedDays: 4,
  pendingDays: 2,
  totalDays: 22,
};

describe("CalendarSnapshotCard", () => {
  it("renders remaining/total and percent left", () => {
    render(<CalendarSnapshotCard summary={baseSummary} formatDays={formatDays} />);
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText(/\/ 22d/)).toBeInTheDocument();
    expect(screen.getByText("73% left")).toBeInTheDocument();
  });

  it("renders segmented bar widths for remaining/pending/used", () => {
    const { container } = render(
      <CalendarSnapshotCard summary={baseSummary} formatDays={formatDays} />
    );
    const bar = container.querySelector('[role="img"]');
    expect(bar).not.toBeNull();
    const segments = bar!.querySelectorAll("div");
    expect(segments[0].style.width).toBe("73%");
    expect(segments[1].style.width).toBe("9%");
    expect(segments[2].style.width).toBe("18%");
  });

  it("guards divide-by-zero when totalDays is 0", () => {
    const { container } = render(
      <CalendarSnapshotCard
        summary={{ remainingDays: 0, usedDays: 0, pendingDays: 0, totalDays: 0 }}
        formatDays={formatDays}
      />
    );
    const bar = container.querySelector('[role="img"]');
    const segments = bar!.querySelectorAll("div");
    segments.forEach((s) => expect(s.style.width).toBe("0%"));
    expect(screen.getByText("0% left")).toBeInTheDocument();
  });

  it("renders nothing when summary is null", () => {
    const { container } = render(<CalendarSnapshotCard summary={null} formatDays={formatDays} />);
    expect(container.firstChild).toBeNull();
  });

  it("bar carries an accessible label", () => {
    render(<CalendarSnapshotCard summary={baseSummary} formatDays={formatDays} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("days remaining");
  });
});
