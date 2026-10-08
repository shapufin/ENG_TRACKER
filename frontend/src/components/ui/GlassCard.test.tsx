import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GlassCard } from "@/components/ui/GlassCard";

/**
 * Helpers to mock window.matchMedia for prefers-reduced-motion.
 * framer-motion's useReducedMotion hook reads this to decide whether
 * to skip entry/exit animations.
 */
function mockMatchMedia(reduceMotion: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduceMotion && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

describe("GlassCard reduced-motion accessibility", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders content immediately when prefers-reduced-motion is reduce", () => {
    mockMatchMedia(true);
    const { getByText } = render(
      <GlassCard>
        <span>Reduced content</span>
      </GlassCard>
    );
    // With initial={false}, content is visible on first render (no fade-in).
    expect(getByText("Reduced content")).toBeInTheDocument();
  });

  it("renders content when reduced-motion is not set", () => {
    mockMatchMedia(false);
    const { getByText } = render(
      <GlassCard>
        <span>Animated content</span>
      </GlassCard>
    );
    expect(getByText("Animated content")).toBeInTheDocument();
  });
});

describe("GlassCard surface", () => {
  afterEach(cleanup);

  it("is a static elevated surface by default (no blur, no hover lift)", () => {
    const { container } = render(<GlassCard>x</GlassCard>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("border-border");
    expect(cls).toContain("bg-card");
    expect(cls).toContain("shadow-card");
    expect(cls).not.toContain("backdrop-blur");
    expect(cls).not.toContain("hover:-translate-y-1");
  });

  it("lifts on hover only when interactive", () => {
    const { container } = render(<GlassCard interactive>x</GlassCard>);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "hover:-translate-y-1"
    );
  });

  it("flat variant drops the shadow for a hairline", () => {
    const { container } = render(<GlassCard variant="flat">x</GlassCard>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("border-line-subtle");
    expect(cls).not.toContain("shadow-card");
  });
});
