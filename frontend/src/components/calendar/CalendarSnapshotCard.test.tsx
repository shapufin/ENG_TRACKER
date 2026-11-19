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

  it("shows what has accrued so far until the whole allowance is accrued", () => {
    const { rerender } = render(
      <CalendarSnapshotCard summary={{ ...baseSummary, accruedDays: 9 }} formatDays={formatDays} />
    );
    expect(screen.getByText(/accrued so far/i)).toHaveTextContent("Accrued so far: 9 of 22d");
    rerender(
      <CalendarSnapshotCard summary={{ ...baseSummary, accruedDays: 22 }} formatDays={formatDays} />
    );
    expect(screen.queryByText(/accrued so far/i)).not.toBeInTheDocument();
    expect(screen.getByText("Fully accrued")).toBeInTheDocument();
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

  it("renders negative live accrued balance when vacation is borrowed in advance", () => {
    render(
      <CalendarSnapshotCard
        summary={{
          ...baseSummary,
          remainingDays: 9,
          usedDays: 13,
          pendingDays: 0,
          totalDays: 22,
          accruedDays: 6,
          liveAccruedBalance: -7,
        }}
        formatDays={formatDays}
      />
    );
    expect(screen.getByText("-7d")).toBeInTheDocument();
    expect(screen.getByText("In advance")).toBeInTheDocument();
    expect(screen.getByText("borrowed")).toBeInTheDocument();
    expect(screen.getByText(/Accrued so far/)).toHaveTextContent("Accrued so far: 6 of 22d");
  });

  it("renders positive live accrued balance when earned to date exceeds usage", () => {
    render(
      <CalendarSnapshotCard
        summary={{
          ...baseSummary,
          remainingDays: 15,
          usedDays: 3,
          pendingDays: 0,
          totalDays: 22,
          accruedDays: 9,
          liveAccruedBalance: 6,
        }}
        formatDays={formatDays}
      />
    );
    expect(screen.getByText("+6d")).toBeInTheDocument();
    expect(screen.getByText("Earned to date")).toBeInTheDocument();
    expect(screen.getByText("available")).toBeInTheDocument();
  });
});
