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
      screen.getByRole("banner", { name: "Calendar controls" }).querySelector(".shadow-glass")
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
});
