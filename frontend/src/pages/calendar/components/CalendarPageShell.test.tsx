import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarPageShell } from "./CalendarPageShell";

vi.mock("@/components/calendar/CalendarSidebar", () => ({
  CalendarSidebar: () => <div data-testid="calendar-sidebar" />,
}));
vi.mock("./CalendarHeader", () => ({
  CalendarHeader: () => <div data-testid="calendar-header" />,
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

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: vi.fn(() => true),
}));

import { useIsMobile } from "@/hooks/useIsMobile";

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
};

describe("CalendarPageShell mobile sidebar", () => {
  it("hides the sidebar behind a Filters toggle on mobile", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<CalendarPageShell {...baseProps} />);

    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-sidebar")).not.toBeInTheDocument();
  });

  it("shows the sidebar as an overlay when the Filters button is activated", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<CalendarPageShell {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    expect(screen.getByTestId("calendar-sidebar")).toBeInTheDocument();
  });

  it("renders the sidebar inline on desktop without a Filters button", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(<CalendarPageShell {...baseProps} />);

    expect(screen.queryByRole("button", { name: /filters/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("calendar-sidebar")).toBeInTheDocument();
  });
});

describe("CalendarPageShell snapshot card", () => {
  it("renders the vacation snapshot in the desktop sidebar column", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(
      <CalendarPageShell
        {...baseProps}
        data={{
          ...baseData,
          vacationSummary: { remainingDays: 16, usedDays: 4, pendingDays: 2, totalDays: 22 },
        }}
      />
    );
    expect(screen.getByText("My vacation snapshot")).toBeInTheDocument();
    expect(screen.getByText("73% left")).toBeInTheDocument();
  });

  it("hides the snapshot when the sidebar is collapsed", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(
      <CalendarPageShell
        {...baseProps}
        data={{
          ...baseData,
          isSidebarCollapsed: true,
          vacationSummary: { remainingDays: 16, usedDays: 4, pendingDays: 2, totalDays: 22 },
        }}
      />
    );
    expect(screen.queryByText("My vacation snapshot")).not.toBeInTheDocument();
  });
});
