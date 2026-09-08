import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceSelector } from "./WorkspaceSelector";
import * as useWorkspaceData from "./hooks/useWorkspaceData";
import { useWorkspaceInit } from "./hooks/useWorkspaceInit";

vi.mock("@/context/CalendarWorkspaceContext", () => ({
  useCalendarWorkspace: () => ({
    selectedWorkspaceIds: [1],
    setSelectedWorkspaces: vi.fn(),
    toggleWorkspace: vi.fn(),
    isMultiSelect: false,
    setIsMultiSelect: vi.fn(),
  }),
}));
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({ isTeamLeader: true, isAdmin: false, isHR: false }),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { team: { id: 99 }, teams: [{ id: 1 }] } }),
}));
vi.mock("./hooks/useWorkspaceData", () => ({ useWorkspaceData: vi.fn() }));
vi.mock("./hooks/useWorkspaceInit", () => ({ useWorkspaceInit: vi.fn() }));
vi.mock("./WorkspaceDropdown", () => ({ WorkspaceDropdown: () => <div data-testid="dropdown" /> }));
vi.mock("./WorkspaceButtons", () => ({ WorkspaceButtons: () => <div data-testid="buttons" /> }));

describe("WorkspaceSelector", () => {
  it("renders dropdown for privileged user", () => {
    vi.mocked(useWorkspaceData.useWorkspaceData).mockReturnValue({
      data: [
        { id: 1, name: "W1" },
        { id: 2, name: "W2" },
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as any);
    render(<WorkspaceSelector />);
    expect(screen.getByTestId("dropdown")).toBeInTheDocument();
    expect(vi.mocked(useWorkspaceInit)).toHaveBeenCalledWith(
      expect.objectContaining({ userTeamId: 99 })
    );
  });

  it("renders buttons variant", () => {
    vi.mocked(useWorkspaceData.useWorkspaceData).mockReturnValue({
      data: [
        { id: 1, name: "W1" },
        { id: 2, name: "W2" },
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as any);
    render(<WorkspaceSelector variant="buttons" />);
    expect(screen.getByTestId("buttons")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    vi.mocked(useWorkspaceData.useWorkspaceData).mockReturnValue({
      data: [],
      isLoading: true,
      refetch: vi.fn(),
    } as any);
    render(<WorkspaceSelector />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    const refetch = vi.fn();
    vi.mocked(useWorkspaceData.useWorkspaceData).mockReturnValue({
      data: [],
      isLoading: false,
      refetch,
    } as any);
    render(<WorkspaceSelector />);
    expect(screen.getByText("No workspaces were found for your account.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Refresh list"));
    expect(refetch).toHaveBeenCalled();
  });
});
