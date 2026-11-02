import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceSelector } from "./WorkspaceSelector";
import * as useWorkspaceData from "./hooks/useWorkspaceData";
import { useWorkspaceInit } from "./hooks/useWorkspaceInit";

const mockSetSelectedWorkspaces = vi.fn();
const mockSetIsMultiSelect = vi.fn();
let mockSelectedWorkspaceIds = [1];
let mockIsMultiSelect = false;
let capturedDropdownProps: any = null;

vi.mock("@/context/CalendarWorkspaceContext", () => ({
  useCalendarWorkspace: () => ({
    selectedWorkspaceIds: mockSelectedWorkspaceIds,
    setSelectedWorkspaces: mockSetSelectedWorkspaces,
    toggleWorkspace: vi.fn(),
    isMultiSelect: mockIsMultiSelect,
    setIsMultiSelect: mockSetIsMultiSelect,
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
vi.mock("./WorkspaceDropdown", () => ({
  WorkspaceDropdown: (props: any) => {
    capturedDropdownProps = props;
    return <div data-testid="dropdown" />;
  },
}));
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

  it("handles multi-selection: adds team and sets isMultiSelect true", () => {
    mockSelectedWorkspaceIds = [1];
    mockIsMultiSelect = false;
    vi.mocked(useWorkspaceData.useWorkspaceData).mockReturnValue({
      data: [
        { id: 1, name: "W1" },
        { id: 2, name: "W2" },
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as any);
    render(<WorkspaceSelector />);
    expect(capturedDropdownProps).toBeDefined();

    // Adding second team (ID 2)
    capturedDropdownProps.onChange(2);
    expect(mockSetSelectedWorkspaces).toHaveBeenCalledWith([1, 2]);
    expect(mockSetIsMultiSelect).toHaveBeenCalledWith(true);
  });

  it("handles selection change (All / Single) with isMultiSelect sync", () => {
    vi.mocked(useWorkspaceData.useWorkspaceData).mockReturnValue({
      data: [
        { id: 1, name: "W1" },
        { id: 2, name: "W2" },
        { id: 3, name: "W3" },
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as any);
    render(<WorkspaceSelector />);

    // Calling All -> [1, 2, 3] -> isMultiSelect true
    capturedDropdownProps.onSelectionChange([1, 2, 3]);
    expect(mockSetSelectedWorkspaces).toHaveBeenCalledWith([1, 2, 3]);
    expect(mockSetIsMultiSelect).toHaveBeenCalledWith(true);

    // Calling Single -> [1] -> isMultiSelect false
    capturedDropdownProps.onSelectionChange([1]);
    expect(mockSetSelectedWorkspaces).toHaveBeenCalledWith([1]);
    expect(mockSetIsMultiSelect).toHaveBeenCalledWith(false);
  });
});
