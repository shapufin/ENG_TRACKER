import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useValidWorkspaceIds } from "./useValidWorkspaceIds";

vi.mock("@/context/CalendarWorkspaceContext", () => ({
  useCalendarWorkspace: vi.fn(),
}));

vi.mock("@/components/calendar/hooks/useWorkspaceData", () => ({
  useWorkspaceData: vi.fn(),
}));

import { useCalendarWorkspace } from "@/context/CalendarWorkspaceContext";
import { useWorkspaceData } from "@/components/calendar/hooks/useWorkspaceData";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useValidWorkspaceIds", () => {
  it("returns empty array while workspaces are loading", () => {
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      selectedWorkspaceIds: [1, 2, 3],
      setSelectedWorkspaces: vi.fn(),
      isMultiSelect: false,
    } as any);
    vi.mocked(useWorkspaceData).mockReturnValue({ data: [], isLoading: true } as any);

    const { result } = renderHook(() => useValidWorkspaceIds(), { wrapper });
    expect(result.current.validIds).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it("returns empty array when workspaces is undefined", () => {
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      selectedWorkspaceIds: [1, 2],
      setSelectedWorkspaces: vi.fn(),
      isMultiSelect: false,
    } as any);
    vi.mocked(useWorkspaceData).mockReturnValue({ data: undefined, isLoading: false } as any);

    const { result } = renderHook(() => useValidWorkspaceIds(), { wrapper });
    expect(result.current.validIds).toEqual([]);
  });

  it("filters out stale IDs not in available workspaces", () => {
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      selectedWorkspaceIds: [1, 2, 3, 4],
      setSelectedWorkspaces: vi.fn(),
      isMultiSelect: false,
    } as any);
    vi.mocked(useWorkspaceData).mockReturnValue({
      data: [{ id: 1 }, { id: 2 }] as any,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useValidWorkspaceIds(), { wrapper });
    expect(result.current.validIds).toEqual([1, 2]);
  });

  it("returns all selected IDs when all are valid", () => {
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      selectedWorkspaceIds: [1, 2],
      setSelectedWorkspaces: vi.fn(),
      isMultiSelect: true,
    } as any);
    vi.mocked(useWorkspaceData).mockReturnValue({
      data: [{ id: 1 }, { id: 2 }, { id: 3 }] as any,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useValidWorkspaceIds(), { wrapper });
    expect(result.current.validIds).toEqual([1, 2]);
  });

  it("returns empty array when all selected IDs are stale", () => {
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      selectedWorkspaceIds: [99, 100],
      setSelectedWorkspaces: vi.fn(),
      isMultiSelect: false,
    } as any);
    vi.mocked(useWorkspaceData).mockReturnValue({
      data: [{ id: 1 }, { id: 2 }] as any,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useValidWorkspaceIds(), { wrapper });
    expect(result.current.validIds).toEqual([]);
  });

  it("returns empty array when no workspaces available", () => {
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      selectedWorkspaceIds: [1],
      setSelectedWorkspaces: vi.fn(),
      isMultiSelect: false,
    } as any);
    vi.mocked(useWorkspaceData).mockReturnValue({ data: [], isLoading: false } as any);

    const { result } = renderHook(() => useValidWorkspaceIds(), { wrapper });
    expect(result.current.validIds).toEqual([]);
  });

  it("preserves selection order", () => {
    vi.mocked(useCalendarWorkspace).mockReturnValue({
      selectedWorkspaceIds: [3, 1, 2],
      setSelectedWorkspaces: vi.fn(),
      isMultiSelect: true,
    } as any);
    vi.mocked(useWorkspaceData).mockReturnValue({
      data: [{ id: 1 }, { id: 2 }, { id: 3 }] as any,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useValidWorkspaceIds(), { wrapper });
    expect(result.current.validIds).toEqual([3, 1, 2]);
  });
});
