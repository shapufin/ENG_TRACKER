import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWorkspaceInit } from "./useWorkspaceInit";

describe("useWorkspaceInit", () => {
  it("selects user team workspace when empty", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [
          { id: 1, team: 5 },
          { id: 2, team: 6 },
        ] as any,
        selectedWorkspaceIds: [],
        setSelectedWorkspaces,
        userTeamId: 5,
        isPrivileged: false,
        isMultiSelect: false,
      })
    );
    expect(setSelectedWorkspaces).toHaveBeenCalledWith([1]);
  });

  it("does not auto-select for employee without team workspace", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1, team: 6 }] as any,
        selectedWorkspaceIds: [],
        setSelectedWorkspaces,
        userTeamId: 5,
        isPrivileged: false,
        isMultiSelect: false,
      })
    );
    expect(setSelectedWorkspaces).not.toHaveBeenCalled();
  });

  it("selects first workspace for privileged", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1 }, { id: 2 }] as any,
        selectedWorkspaceIds: [],
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: true,
        isMultiSelect: true,
      })
    );
    expect(setSelectedWorkspaces).toHaveBeenCalledWith([1]);
  });

  it("resets stale multi-select when disabled", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1 }, { id: 2 }] as any,
        selectedWorkspaceIds: [1, 2],
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: false,
        isMultiSelect: false,
      })
    );
    expect(setSelectedWorkspaces).toHaveBeenCalledWith([1]);
  });

  it("does nothing while loading", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: true,
        workspaces: [],
        selectedWorkspaceIds: [],
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: true,
        isMultiSelect: true,
      })
    );
    expect(setSelectedWorkspaces).not.toHaveBeenCalled();
  });

  it("does nothing when no workspaces", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [],
        selectedWorkspaceIds: [],
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: true,
        isMultiSelect: true,
      })
    );
    expect(setSelectedWorkspaces).not.toHaveBeenCalled();
  });

  it("keeps existing selection when privileged", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1 }, { id: 2 }] as any,
        selectedWorkspaceIds: [2],
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: true,
        isMultiSelect: true,
      })
    );
    expect(setSelectedWorkspaces).not.toHaveBeenCalled();
  });

  // Branch coverage: initializedRef guard
  it("does not re-initialize after first run (initializedRef guard)", () => {
    const setSelectedWorkspaces = vi.fn();
    const { rerender } = renderHook(
      ({ workspaces }: { workspaces: any[] }) =>
        useWorkspaceInit({
          isLoading: false,
          workspaces,
          selectedWorkspaceIds: [],
          setSelectedWorkspaces,
          userTeamId: null,
          isPrivileged: true,
          isMultiSelect: true,
        }),
      { initialProps: { workspaces: [{ id: 1 }] } }
    );
    expect(setSelectedWorkspaces).toHaveBeenCalledTimes(1);
    expect(setSelectedWorkspaces).toHaveBeenCalledWith([1]);
    // Re-render with new workspaces; should NOT call again because initializedRef is true
    rerender({ workspaces: [{ id: 99 }, { id: 100 }] });
    expect(setSelectedWorkspaces).toHaveBeenCalledTimes(1);
  });

  it("selects user team workspace when userTeamId matches and isPrivileged is false", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 10, team: 42 }] as any,
        selectedWorkspaceIds: [],
        setSelectedWorkspaces,
        userTeamId: 42,
        isPrivileged: false,
        isMultiSelect: true,
      })
    );
    expect(setSelectedWorkspaces).toHaveBeenCalledWith([10]);
  });

  it("selects first workspace for privileged when userTeamId is null", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 5 }, { id: 6 }] as any,
        selectedWorkspaceIds: [],
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: true,
        isMultiSelect: true,
      })
    );
    expect(setSelectedWorkspaces).toHaveBeenCalledWith([5]);
  });

  it("does not auto-select for non-privileged user with no team workspace match", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1, team: 99 }] as any,
        selectedWorkspaceIds: [],
        setSelectedWorkspaces,
        userTeamId: 50,
        isPrivileged: false,
        isMultiSelect: true,
      })
    );
    expect(setSelectedWorkspaces).not.toHaveBeenCalled();
  });

  it("keeps existing single selection when isMultiSelect is false", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1 }, { id: 2 }] as any,
        selectedWorkspaceIds: [2],
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: false,
        isMultiSelect: false,
      })
    );
    expect(setSelectedWorkspaces).not.toHaveBeenCalled();
  });

  it("keeps existing multi selection when isMultiSelect is true", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1 }, { id: 2 }] as any,
        selectedWorkspaceIds: [1, 2],
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: true,
        isMultiSelect: true,
      })
    );
    expect(setSelectedWorkspaces).not.toHaveBeenCalled();
  });

  it("prunes stale workspace IDs that no longer exist in available workspaces", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1 }, { id: 2 }] as any,
        selectedWorkspaceIds: [1, 2, 3], // 3 is stale (no longer accessible)
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: false,
        isMultiSelect: false,
      })
    );
    expect(setSelectedWorkspaces).toHaveBeenCalledWith([1]);
  });

  it("prunes stale IDs in multi-select mode keeping valid ones", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1 }, { id: 2 }] as any,
        selectedWorkspaceIds: [1, 2, 3, 4], // 3 and 4 are stale
        setSelectedWorkspaces,
        userTeamId: null,
        isPrivileged: true,
        isMultiSelect: true,
      })
    );
    expect(setSelectedWorkspaces).toHaveBeenCalledWith([1, 2]);
  });

  it("falls back to auto-select when all selected IDs are stale", () => {
    const setSelectedWorkspaces = vi.fn();
    renderHook(() =>
      useWorkspaceInit({
        isLoading: false,
        workspaces: [{ id: 1, team: 5 }] as any,
        selectedWorkspaceIds: [99, 100], // all stale
        setSelectedWorkspaces,
        userTeamId: 5,
        isPrivileged: false,
        isMultiSelect: false,
      })
    );
    expect(setSelectedWorkspaces).toHaveBeenCalledWith([1]);
  });
});
