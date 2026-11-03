import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarPageShell } from "./CalendarPageShell";

vi.mock("@/components/calendar/CalendarSidebar", () => ({
  CalendarSidebar: ({ snapshotSummary }: { snapshotSummary?: { remainingDays: number } }) => (
    <div data-testid="calendar-sidebar" data-remaining={snapshotSummary?.remainingDays} />
  ),
}));
vi.mock("./CalendarHeader", () => ({
  CalendarHeader: ({ leading }: { leading?: React.ReactNode }) => (
    <div data-testid="calendar-header">{leading}</div>
  ),
}));
vi.mock("./CalendarBottomCards", () => ({
  CalendarBottomCards: () => <div data-testid="bottom-cards" />,
}));
vi.mock("./CalendarPageMain", () => ({
  CalendarPageMain: () => <div data-testid="page-main" />,
}));
vi.mock("./CalendarPageModals", () => ({
  CalendarPageModals: () => <div data-testid="page-modals" />,
}));

vi.mock("@/hooks/useIsBelowXl", () => ({
  useIsBelowXl: vi.fn(() => true),
}));

import { useIsBelowXl } from "@/hooks/useIsBelowXl";

const baseData = {
  isFullscreen: false,
  isSidebarCollapsed: false,
  currentMonth: new Date("2024-06-15"),
  viewMode: "list" as const,
  events: [],
  allUsers: [],
  visibleUsers: new Set<number>(),
  toggleUser: vi.fn(),
  handleResetVisibleUsers: vi.fn(),
  showStandby: true,
  showVacation: true,
  showSick: true,
  toggleEventType: vi.fn(),
  handleUserClick: vi.fn(),
  handleSidebarToggle: vi.fn(),
  groupedUsersWithNames: [],
  workspaceUsersPartial: false,
  vacationSummary: null,
  carryOverAndBalance: {},
  metricBars: [],
  conflictEntries: [],
  formatDays: (v: number) => `${v}d`,
  setConflictsModalOpen: vi.fn(),
  handleToggleFullscreen: vi.fn(),
  handleClearWorkspaceSelection: vi.fn(),
} as any;

const baseProps = {
  user: null,
  canViewTeamData: false,
  selectedWorkspaceIds: [1],
  data: baseData,
  onPrevMonth: vi.fn(),
  onNextMonth: vi.fn(),
  onToday: vi.fn(),
  onSetViewMode: vi.fn(),
  onToggleWorkspace: vi.fn(),
};

describe("CalendarPageShell mobile sidebar", () => {
  it("hides the sidebar behind a Filters toggle on mobile", () => {
    vi.mocked(useIsBelowXl).mockReturnValue(true);
    render(<CalendarPageShell {...baseProps} />);

    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-sidebar")).not.toBeInTheDocument();
  });

  it("shows the sidebar as an overlay when the Filters button is activated", () => {
    vi.mocked(useIsBelowXl).mockReturnValue(true);
    render(<CalendarPageShell {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    expect(screen.getByTestId("calendar-sidebar")).toBeInTheDocument();
  });

  it("renders the sidebar inline on desktop without a Filters button", () => {
    vi.mocked(useIsBelowXl).mockReturnValue(false);
    render(<CalendarPageShell {...baseProps} />);

    expect(screen.queryByRole("button", { name: /filters/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("calendar-sidebar")).toBeInTheDocument();
  });
});

describe("CalendarPageShell snapshot card", () => {
  it("hands the vacation summary to the sidebar, which owns the single snapshot card", () => {
    vi.mocked(useIsBelowXl).mockReturnValue(false);
    render(
      <CalendarPageShell
        {...baseProps}
        data={{
          ...baseData,
          vacationSummary: { remainingDays: 16, usedDays: 4, pendingDays: 2, totalDays: 22 },
        }}
      />
    );
    expect(screen.getByTestId("calendar-sidebar")).toHaveAttribute("data-remaining", "16");
    expect(screen.queryByText("My vacation snapshot")).not.toBeInTheDocument();
  });
});

describe("CalendarPageShell truncated events", () => {
  it("warns when the server held more events than the calendar could load", () => {
    vi.mocked(useIsBelowXl).mockReturnValue(false);
    render(<CalendarPageShell {...baseProps} data={{ ...baseData, eventsTruncated: true }} />);
    expect(screen.getByRole("status", { name: /truncated events warning/i })).toBeInTheDocument();
  });

  it("stays quiet when every event loaded", () => {
    vi.mocked(useIsBelowXl).mockReturnValue(false);
    render(<CalendarPageShell {...baseProps} data={{ ...baseData, eventsTruncated: false }} />);
    expect(screen.queryByRole("status", { name: /truncated events warning/i })).toBeNull();
  });
});
