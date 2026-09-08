import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CalendarPage } from "./CalendarPage";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { useCalendarWorkspace } from "@/context/CalendarWorkspaceContext";
import { useValidWorkspaceIds } from "@/hooks/useValidWorkspaceIds";
import { useCalendarPageData } from "./hooks/useCalendarPageData";

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/context/PermissionContext", () => ({ usePermissions: vi.fn() }));
vi.mock("@/context/CalendarWorkspaceContext", () => ({ useCalendarWorkspace: vi.fn() }));
vi.mock("@/hooks/useValidWorkspaceIds", () => ({ useValidWorkspaceIds: vi.fn() }));
vi.mock("./hooks/useCalendarPageData", () => ({ useCalendarPageData: vi.fn() }));
vi.mock("@/components/calendar/WorkspaceSelector", () => ({
  WorkspaceSelector: ({ className }: any) => (
    <button data-testid="workspace-selector" className={className}>
      Select Workspace
    </button>
  ),
}));
vi.mock("@/components/ui/LoadingCard", () => ({
  LoadingCard: ({ title }: any) => <div data-testid="loading-card">{title}</div>,
}));
vi.mock("@/components/ui/ErrorCard", () => ({
  ErrorCard: ({ title, onRetry }: any) => (
    <div data-testid="error-card">
      {title}
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));
vi.mock("./components/CalendarPageShell", () => ({
  CalendarPageShell: ({ onPrevMonth, onNextMonth, onToday, onSetViewMode }: any) => (
    <div data-testid="calendar-shell">
      <button onClick={onPrevMonth}>Prev</button>
      <button onClick={onNextMonth}>Next</button>
      <button onClick={onToday}>Today</button>
      <button onClick={() => onSetViewMode("week")}>Week</button>
    </div>
  ),
}));

const baseWorkspace = {
  selectedWorkspaceIds: [1],
  setSelectedWorkspaces: vi.fn(),
  isMultiSelect: false,
};

const baseValidIds = { validIds: [1], isLoading: false };

const baseData = {
  currentMonth: new Date("2024-06-15"),
  setCurrentMonth: vi.fn(),
  viewMode: "month",
  setViewMode: vi.fn(),
  hasWorkspaceSelection: true,
  isLoading: false,
  hasError: false,
  workspaceScope: "1",
};

const renderWithQuery = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("CalendarPage", () => {
  it("renders workspace selection prompt when no workspace selected", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as any);
    vi.mocked(usePermissions).mockReturnValue({
      canViewWorkspaceMembers: false,
      canViewTeamData: false,
    } as any);
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      ...baseWorkspace,
      selectedWorkspaceIds: [],
    } as any);
    vi.mocked(useValidWorkspaceIds).mockReturnValue({ validIds: [], isLoading: false } as any);
    vi.mocked(useCalendarPageData).mockReturnValue({
      ...baseData,
      hasWorkspaceSelection: false,
    } as any);

    renderWithQuery(<CalendarPage />);
    expect(screen.getByText("Select a workspace to view the calendar")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-selector")).toBeInTheDocument();
  });

  it("wraps the workspace selection prompt in the shared GlassCard surface", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as any);
    vi.mocked(usePermissions).mockReturnValue({
      canViewWorkspaceMembers: false,
      canViewTeamData: false,
    } as any);
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      ...baseWorkspace,
      selectedWorkspaceIds: [],
    } as any);
    vi.mocked(useValidWorkspaceIds).mockReturnValue({ validIds: [], isLoading: false } as any);
    vi.mocked(useCalendarPageData).mockReturnValue({
      ...baseData,
      hasWorkspaceSelection: false,
    } as any);

    const { container } = renderWithQuery(<CalendarPage />);
    expect(container.querySelector(".bg-card:not(.bg-card-90)")).toBeInTheDocument();
  });

  it("renders loading card while data is loading", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as any);
    vi.mocked(usePermissions).mockReturnValue({
      canViewWorkspaceMembers: false,
      canViewTeamData: false,
    } as any);
    vi.mocked(useCalendarWorkspace).mockReturnValue(baseWorkspace as any);
    vi.mocked(useValidWorkspaceIds).mockReturnValue(baseValidIds as any);
    vi.mocked(useCalendarPageData).mockReturnValue({ ...baseData, isLoading: true } as any);

    renderWithQuery(<CalendarPage />);
    expect(screen.getByTestId("loading-card")).toBeInTheDocument();
  });

  it("renders error card when data has error", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as any);
    vi.mocked(usePermissions).mockReturnValue({
      canViewWorkspaceMembers: false,
      canViewTeamData: false,
    } as any);
    vi.mocked(useCalendarWorkspace).mockReturnValue(baseWorkspace as any);
    vi.mocked(useValidWorkspaceIds).mockReturnValue(baseValidIds as any);
    vi.mocked(useCalendarPageData).mockReturnValue({ ...baseData, hasError: true } as any);

    renderWithQuery(<CalendarPage />);
    expect(screen.getByTestId("error-card")).toBeInTheDocument();
  });

  it("renders calendar shell when data is loaded", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as any);
    vi.mocked(usePermissions).mockReturnValue({
      canViewWorkspaceMembers: false,
      canViewTeamData: false,
    } as any);
    vi.mocked(useCalendarWorkspace).mockReturnValue(baseWorkspace as any);
    vi.mocked(useValidWorkspaceIds).mockReturnValue(baseValidIds as any);
    vi.mocked(useCalendarPageData).mockReturnValue(baseData as any);

    renderWithQuery(<CalendarPage />);
    expect(screen.getByTestId("calendar-shell")).toBeInTheDocument();
  });

  it("prev/next/today buttons call setCurrentMonth", () => {
    const setCurrentMonth = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as any);
    vi.mocked(usePermissions).mockReturnValue({
      canViewWorkspaceMembers: false,
      canViewTeamData: false,
    } as any);
    vi.mocked(useCalendarWorkspace).mockReturnValue(baseWorkspace as any);
    vi.mocked(useValidWorkspaceIds).mockReturnValue(baseValidIds as any);
    vi.mocked(useCalendarPageData).mockReturnValue({ ...baseData, setCurrentMonth } as any);

    renderWithQuery(<CalendarPage />);
    fireEvent.click(screen.getByText("Prev"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Today"));
    expect(setCurrentMonth).toHaveBeenCalledTimes(3);
  });

  it("view mode button calls setViewMode", () => {
    const setViewMode = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as any);
    vi.mocked(usePermissions).mockReturnValue({
      canViewWorkspaceMembers: false,
      canViewTeamData: false,
    } as any);
    vi.mocked(useCalendarWorkspace).mockReturnValue(baseWorkspace as any);
    vi.mocked(useValidWorkspaceIds).mockReturnValue(baseValidIds as any);
    vi.mocked(useCalendarPageData).mockReturnValue({ ...baseData, setViewMode } as any);

    renderWithQuery(<CalendarPage />);
    fireEvent.click(screen.getByText("Week"));
    expect(setViewMode).toHaveBeenCalledWith("week");
  });

  it("uses single workspace when isMultiSelect is false", () => {
    const setSelectedWorkspaces = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as any);
    vi.mocked(usePermissions).mockReturnValue({
      canViewWorkspaceMembers: false,
      canViewTeamData: false,
    } as any);
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      ...baseWorkspace,
      selectedWorkspaceIds: [1, 2, 3],
      setSelectedWorkspaces,
      isMultiSelect: false,
    } as any);
    vi.mocked(useValidWorkspaceIds).mockReturnValue({
      validIds: [1, 2, 3],
      isLoading: false,
    } as any);
    vi.mocked(useCalendarPageData).mockReturnValue(baseData as any);

    renderWithQuery(<CalendarPage />);
    expect(screen.getByTestId("calendar-shell")).toBeInTheDocument();
  });
});
