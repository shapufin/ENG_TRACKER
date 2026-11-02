import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarHeader } from "./CalendarHeader";

vi.mock("@/components/calendar/WorkspaceSelector", () => ({
  WorkspaceSelector: () => <div data-testid="workspace-selector" />,
}));
vi.mock("@/lib/calendar-export", () => ({
  exportToCSV: vi.fn(),
  exportToICal: vi.fn(),
}));

const baseProps = {
  currentMonth: new Date("2024-06-15"),
  viewMode: "month" as const,
  isFullscreen: false,
  selectedWorkspaceIds: [1],
  events: [],
  onPrevMonth: vi.fn(),
  onNextMonth: vi.fn(),
  onToday: vi.fn(),
  onSetViewMode: vi.fn(),
  onToggleFullscreen: vi.fn(),
  onClearWorkspaceSelection: vi.fn(),
  onRequestTimeOff: vi.fn(),
};

describe("CalendarHeader", () => {
  it("exposes the active calendar view with aria-pressed", () => {
    render(<CalendarHeader {...baseProps} />);

    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "false");
  });

  it("provides accessible labels for calendar actions", () => {
    render(<CalendarHeader {...baseProps} />);

    expect(screen.getByRole("banner", { name: "Calendar controls" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export calendar as CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear workspace selection" })).toBeEnabled();
  });

  it("renders the toolbar in the shared glass surface", () => {
    render(<CalendarHeader {...baseProps} />);

    expect(
      screen.getByRole("banner", { name: "Calendar controls" }).querySelector(".shadow-card")
    ).toBeInTheDocument();
  });

  it("provides touch-sized icon controls on mobile", () => {
    render(<CalendarHeader {...baseProps} />);

    const prevButton = screen.getByRole("button", { name: "Previous month" });
    expect(prevButton.className).toContain("h-11");
    expect(prevButton.className).toContain("w-11");
    expect(prevButton.className).toContain("md:h-9");
    expect(prevButton.className).toContain("md:w-9");
  });

  it("shows export text labels only at 2xl so the strip holds one line on laptops", () => {
    render(<CalendarHeader {...baseProps} />);

    const csvButton = screen.getByRole("button", { name: "Export calendar as CSV" });
    const csvLabel = csvButton.querySelector("span");
    expect(csvLabel?.className).toContain("hidden");
    expect(csvLabel?.className).toContain("2xl:inline");

    const icalButton = screen.getByRole("button", { name: "Export calendar as iCal" });
    const icalLabel = icalButton.querySelector("span");
    expect(icalLabel?.className).toContain("hidden");
    expect(icalLabel?.className).toContain("2xl:inline");
  });

  it("wraps by available width, not by a viewport breakpoint", () => {
    render(<CalendarHeader {...baseProps} />);

    const banner = screen.getByRole("banner", { name: "Calendar controls" });
    const card = banner.firstElementChild;
    expect(card?.className).toContain("flex-wrap");
    expect(card?.className).not.toMatch(/flex-nowrap/);
    expect(banner.querySelector(".basis-full")).toBeNull();
  });

  it("shows the staffing state at every width and uses tone tokens", () => {
    render(<CalendarHeader {...baseProps} />);

    const badge = screen.getByText("Full Staffing").parentElement;
    expect(badge?.className).not.toContain("hidden");
    expect(badge?.className).toContain("tone-success");
    expect(badge?.className).not.toMatch(/emerald|dark:/);
  });

  it("gives CSV and iCal different icons", () => {
    render(<CalendarHeader {...baseProps} />);

    const csv = screen.getByRole("button", { name: "Export calendar as CSV" }).querySelector("svg");
    const ical = screen
      .getByRole("button", { name: "Export calendar as iCal" })
      .querySelector("svg");
    expect(csv?.getAttribute("class")).not.toEqual(ical?.getAttribute("class"));
  });

  it("keeps the phone toolbar short: fullscreen/reset only from sm, actions ordered before view tabs", () => {
    render(<CalendarHeader {...baseProps} onToggleDensity={vi.fn()} />);

    for (const name of ["Enter fullscreen", "Clear workspace selection"]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).toContain("hidden");
      expect(cls).toContain("sm:inline-flex");
    }
    const order = (el: HTMLElement) => el.className.match(/(?:^|\s)order-(\d)(?:\s|$)/)?.[1];
    const request = order(screen.getByRole("button", { name: /request time off/i }));
    const csv = order(screen.getByRole("button", { name: "Export calendar as CSV" }));
    const views = order(screen.getByRole("group", { name: "Calendar view" }));
    expect(Number(request)).toBeLessThan(Number(csv));
    expect(Number(csv)).toBeLessThan(Number(views));
  });
});
