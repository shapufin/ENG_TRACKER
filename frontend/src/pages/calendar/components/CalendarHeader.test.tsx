import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CalendarHeader } from "./CalendarHeader";
import { exportToCSV, exportToICal } from "@/lib/calendar-export";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(screen.getByRole("button", { name: "Export calendar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear workspace selection" })).toBeEnabled();
  });

  it("is a flat toolbar, not a card surface", () => {
    render(<CalendarHeader {...baseProps} />);

    const banner = screen.getByRole("banner", { name: "Calendar controls" });
    // The month grid owns the only card surface on this page.
    expect(banner.querySelector(".shadow-card")).toBeNull();
    expect(banner.querySelector("[class*='rounded-2xl']")).toBeNull();
  });

  it("never hand-writes a control height (control-kit rule)", () => {
    render(<CalendarHeader {...baseProps} onToggleDensity={vi.fn()} />);

    for (const name of [
      "Previous month",
      "Next month",
      "Export calendar",
      "Enter fullscreen",
      "Toggle calendar density",
    ]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).not.toMatch(/(^|\s)h-(8|9|10|11|12)(\s|$)/);
      expect(cls).not.toMatch(/(^|\s)w-(8|9|10|11|12)(\s|$)/);
    }
  });

  it("keeps the month title in an h1 inside the header (e2e selector)", () => {
    render(<CalendarHeader {...baseProps} />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("June 2024");
    expect(heading.closest("header")).toHaveAttribute("aria-label", "Calendar controls");
  });

  it("wires the month navigation and today controls", () => {
    render(<CalendarHeader {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(baseProps.onPrevMonth).toHaveBeenCalledTimes(1);
    expect(baseProps.onNextMonth).toHaveBeenCalledTimes(1);
    expect(baseProps.onToday).toHaveBeenCalledTimes(1);
  });

  it("collapses CSV and iCal into one export menu that calls the right exporter", async () => {
    render(<CalendarHeader {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Export calendar" }));

    const csv = await screen.findByRole("button", { name: "Export calendar as CSV" });
    fireEvent.click(csv);
    await waitFor(() => expect(exportToCSV).toHaveBeenCalledTimes(1));
    expect(exportToICal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Export calendar" }));
    const ical = await screen.findByRole("button", { name: "Export calendar as iCal" });
    fireEvent.click(ical);
    await waitFor(() => expect(exportToICal).toHaveBeenCalledTimes(1));
  });

  it("shows the conflict count as a labelled action", () => {
    const onOpenConflictsModal = vi.fn();
    render(
      <CalendarHeader
        {...baseProps}
        conflictCount={3}
        onOpenConflictsModal={onOpenConflictsModal}
      />
    );

    const chip = screen.getByRole("button", { name: "3 team conflicts" });
    fireEvent.click(chip);
    expect(onOpenConflictsModal).toHaveBeenCalledTimes(1);
  });

  it("shows full staffing with tone tokens when there are no conflicts", () => {
    render(<CalendarHeader {...baseProps} conflictCount={0} onOpenConflictsModal={vi.fn()} />);

    const badge = screen.getByLabelText("Full staffing coverage");
    expect(badge.className).toContain("tone-success");
    expect(badge.className).not.toMatch(/emerald|dark:/);
  });

  it("switches the fullscreen label with the state", () => {
    const { rerender } = render(<CalendarHeader {...baseProps} />);
    expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument();

    rerender(<CalendarHeader {...baseProps} isFullscreen />);
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();
  });

  it("fires the toolbar actions", () => {
    const onToggleDensity = vi.fn();
    render(<CalendarHeader {...baseProps} onToggleDensity={onToggleDensity} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle calendar density" }));
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear workspace selection" }));
    fireEvent.click(screen.getByRole("button", { name: /request time off/i }));

    expect(onToggleDensity).toHaveBeenCalledTimes(1);
    expect(baseProps.onToggleFullscreen).toHaveBeenCalledTimes(1);
    expect(baseProps.onClearWorkspaceSelection).toHaveBeenCalledTimes(1);
    expect(baseProps.onRequestTimeOff).toHaveBeenCalledTimes(1);
  });
});
