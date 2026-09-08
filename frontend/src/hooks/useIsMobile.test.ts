import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsMobile } from "./useIsMobile";

const mockMatchMedia = (matches: boolean) => {
  const listeners: ((event: MediaQueryListEvent) => void)[] = [];
  const mediaQuery = {
    matches,
    addEventListener: vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.push(listener);
    }),
    removeEventListener: vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQuery)
  );
  return { mediaQuery, listeners };
};

describe("useIsMobile", () => {
  it("returns true when viewport is below 768px", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false when viewport is 768px or above", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("updates when the viewport changes", () => {
    const { mediaQuery, listeners } = mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      listeners.forEach((listener) =>
        listener({ matches: true } as unknown as MediaQueryListEvent)
      );
    });
    expect(result.current).toBe(true);

    expect(mediaQuery.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
