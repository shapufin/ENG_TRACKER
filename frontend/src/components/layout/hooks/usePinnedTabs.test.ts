import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePinnedTabs } from "./usePinnedTabs";
import type { NavItem } from "./useVisibleNavItems";

const item = (path: string, label: string) => ({ path, label }) as unknown as NavItem;
const items = [
  item("/dashboard", "Dashboard"),
  item("/overtime", "Overtime"),
  item("/standby", "Standby"),
  item("/leave-management", "Leave"),
  item("/calendar", "Calendar"),
];

describe("usePinnedTabs", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to the first four daily pages and is not customised", () => {
    const { result } = renderHook(() => usePinnedTabs(7, items));
    expect(result.current.pinnedPaths).toEqual([
      "/dashboard",
      "/overtime",
      "/standby",
      "/leave-management",
    ]);
    expect(result.current.customized).toBe(false);
  });

  it("saves a choice per user and keeps it across renders", () => {
    const { result } = renderHook(() => usePinnedTabs(7, items));
    act(() => result.current.setPinned(["/dashboard", "/calendar", "/overtime"]));
    expect(result.current.pinnedPaths).toEqual(["/dashboard", "/calendar", "/overtime"]);
    expect(result.current.customized).toBe(true);

    const again = renderHook(() => usePinnedTabs(7, items));
    expect(again.result.current.pinnedPaths).toEqual(["/dashboard", "/calendar", "/overtime"]);
    const other = renderHook(() => usePinnedTabs(8, items));
    expect(other.result.current.customized).toBe(false);
  });

  it("drops pages the sidebar no longer shows and falls back below three", () => {
    localStorage.setItem("pinned_tabs:7", JSON.stringify(["/dashboard", "/gone", "/also-gone"]));
    const { result } = renderHook(() => usePinnedTabs(7, items));
    expect(result.current.pinnedPaths).toEqual([
      "/dashboard",
      "/overtime",
      "/standby",
      "/leave-management",
    ]);
  });

  it("caps a saved list at four and ignores corrupt storage", () => {
    localStorage.setItem(
      "pinned_tabs:7",
      JSON.stringify(["/dashboard", "/overtime", "/standby", "/leave-management", "/calendar"])
    );
    expect(renderHook(() => usePinnedTabs(7, items)).result.current.pinnedPaths).toHaveLength(4);
    localStorage.setItem("pinned_tabs:7", "{not json");
    expect(renderHook(() => usePinnedTabs(7, items)).result.current.customized).toBe(false);
  });

  it("reset returns to the defaults", () => {
    const { result } = renderHook(() => usePinnedTabs(7, items));
    act(() => result.current.setPinned(["/dashboard", "/calendar", "/overtime"]));
    act(() => result.current.reset());
    expect(result.current.customized).toBe(false);
    expect(localStorage.getItem("pinned_tabs:7")).toBeNull();
  });
});
