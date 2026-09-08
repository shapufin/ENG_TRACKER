import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useSkillsColumnWidth } from "./useSkillsColumnWidth";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
);

describe("useSkillsColumnWidth", () => {
  it("returns the default width before any measurement", () => {
    const { result } = renderHook(() => {
      const scrollRef = useRef<HTMLDivElement>(null);
      return useSkillsColumnWidth({
        scrollRef,
        skillCount: 5,
        memberColWidth: 176,
        minWidth: 80,
        maxWidth: 180,
        defaultWidth: 64,
      });
    });
    expect(result.current).toBe(64);
  });

  it("computes the clamped width when the viewport is measurable", () => {
    const { result } = renderHook(() => {
      const scrollRef = useRef<HTMLDivElement>(null);
      // Simulate a mounted scroll container with a fixed client width.
      Object.defineProperty(scrollRef, "current", {
        value: { clientWidth: 1000 },
        configurable: true,
      });
      return useSkillsColumnWidth({
        scrollRef,
        skillCount: 5,
        memberColWidth: 176,
        minWidth: 80,
        maxWidth: 180,
        defaultWidth: 64,
      });
    });
    // (1000 - 176) / 5 = 164.8 → within [80, 180]
    expect(result.current).toBe(164.8);
  });

  it("clamps to minWidth when columns are numerous", () => {
    const { result } = renderHook(() => {
      const scrollRef = useRef<HTMLDivElement>(null);
      Object.defineProperty(scrollRef, "current", {
        value: { clientWidth: 400 },
        configurable: true,
      });
      return useSkillsColumnWidth({
        scrollRef,
        skillCount: 50,
        memberColWidth: 176,
        minWidth: 80,
        maxWidth: 180,
        defaultWidth: 64,
      });
    });
    // (400 - 176) / 50 = 4.48 → clamped to 80
    expect(result.current).toBe(80);
  });

  it("does not measure when skillCount is 0", () => {
    const { result } = renderHook(() => {
      const scrollRef = useRef<HTMLDivElement>(null);
      Object.defineProperty(scrollRef, "current", {
        value: { clientWidth: 1000 },
        configurable: true,
      });
      return useSkillsColumnWidth({
        scrollRef,
        skillCount: 0,
        memberColWidth: 176,
        minWidth: 80,
        maxWidth: 180,
        defaultWidth: 64,
      });
    });
    expect(result.current).toBe(64);
  });
});
