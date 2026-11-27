import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { AuthContext } from "@/context/auth-context-base";
import { useSidebarGroups } from "./useSidebarGroups";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(AuthContext.Provider, { value: { user: { id: 7 } } as never }, children);

describe("useSidebarGroups", () => {
  beforeEach(() => localStorage.clear());

  it("defaults every section to open", () => {
    const { result } = renderHook(() => useSidebarGroups("app", null), { wrapper });
    expect(result.current.isOpen("core")).toBe(true);
  });

  it("remembers a closed section across remounts", () => {
    const first = renderHook(() => useSidebarGroups("app", null), { wrapper });
    act(() => first.result.current.toggle("hr"));
    expect(first.result.current.isOpen("hr")).toBe(false);
    first.unmount();
    expect(localStorage.getItem("sidebar_groups:app:7")).not.toBeNull();
    const second = renderHook(() => useSidebarGroups("app", null), { wrapper });
    expect(second.result.current.isOpen("hr")).toBe(false);
    expect(second.result.current.isOpen("core")).toBe(true);
  });

  it("opens the section holding the active route even when stored closed", () => {
    localStorage.setItem("sidebar_groups:app:7", JSON.stringify({ closed: ["core"] }));
    const { result } = renderHook(() => useSidebarGroups("app", "core"), { wrapper });
    expect(result.current.isOpen("core")).toBe(true);
  });

  it("lets the user close the active section until the route changes section", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: string | null }) => useSidebarGroups("app", active),
      { wrapper, initialProps: { active: "core" } }
    );
    act(() => result.current.toggle("core"));
    expect(result.current.isOpen("core")).toBe(false);
    rerender({ active: "hr" });
    rerender({ active: "core" });
    expect(result.current.isOpen("core")).toBe(true);
  });

  it("keeps app and admin scopes apart", () => {
    const app = renderHook(() => useSidebarGroups("app", null), { wrapper });
    act(() => app.result.current.toggle("core"));
    const admin = renderHook(() => useSidebarGroups("admin", null), { wrapper });
    expect(admin.result.current.isOpen("core")).toBe(true);
  });
});
