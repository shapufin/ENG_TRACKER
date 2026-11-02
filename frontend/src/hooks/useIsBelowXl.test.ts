import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsBelowXl } from "./useIsBelowXl";

const stubMatchMedia = (matches: boolean) => {
  const query = vi.fn((q: string) => ({
    matches,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("matchMedia", query);
  return query;
};

describe("useIsBelowXl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is true below the 1280px xl breakpoint, where the calendar sidebar becomes a drawer", () => {
    const query = stubMatchMedia(true);
    const { result } = renderHook(() => useIsBelowXl());
    expect(result.current).toBe(true);
    expect(query).toHaveBeenCalledWith("(max-width: 1279px)");
  });

  it("is false from 1280px up", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsBelowXl());
    expect(result.current).toBe(false);
  });
});
