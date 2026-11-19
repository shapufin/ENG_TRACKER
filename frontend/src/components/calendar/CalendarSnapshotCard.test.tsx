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
  it("renders Current label, left / accumulated days, and percent left", () => {
    render(<CalendarSnapshotCard summary={baseSummary} formatDays={formatDays} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText(/\/ 22d left/)).toBeInTheDocument();
    expect(screen.getByText("73% left")).toBeInTheDocument();
    expect(screen.getByText("Total vacation entitlement:")).toBeInTheDocument();
    expect(screen.getByText("22d")).toBeInTheDocument();
  });

  it("dynamically updates ratio to left days / current accumulated days (e.g. 8 / 13d left)", () => {
    render(
      <CalendarSnapshotCard
        summary={{
          ...baseSummary,
          remainingDays: 8,
          usedDays: 5,
          pendingDays: 0,
          totalDays: 22,
          accruedDays: 13,
          liveAccruedBalance: 8,
        }}
        formatDays={formatDays}
      />
    );
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText(/\/ 13d left/)).toBeInTheDocument();
    expect(screen.getByText("62% left")).toBeInTheDocument();
    expect(screen.getByText("Total vacation entitlement:")).toBeInTheDocument();
    expect(screen.getByText("22d")).toBeInTheDocument();
    // Used is removed from the card to keep it clean (available in modal)
    expect(screen.queryByText(/used:/i)).not.toBeInTheDocument();
    expect(screen.getByText(/pending:/i)).toHaveTextContent("Pending: 0d");
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

  it("renders In advance when vacation is borrowed ahead of accrual (negative left balance)", () => {
    render(
      <CalendarSnapshotCard
        summary={{
          ...baseSummary,
          remainingDays: 2,
          usedDays: 10,
          pendingDays: 0,
          totalDays: 22,
          accruedDays: 6,
          liveAccruedBalance: -4,
        }}
        formatDays={formatDays}
      />
    );
    expect(screen.getByText("-4")).toBeInTheDocument();
    expect(screen.getByText(/\/ 6d left/)).toBeInTheDocument();
    expect(screen.getByText("In advance")).toBeInTheDocument();
  });
});
