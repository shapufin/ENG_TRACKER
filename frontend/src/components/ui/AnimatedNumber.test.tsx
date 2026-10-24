import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => true };
});

describe("AnimatedNumber reduced motion", () => {
  it("renders the target value instantly (no spring) when reduced motion is preferred", async () => {
    const { AnimatedNumber } = await import("./AnimatedNumber");
    render(<AnimatedNumber value={42} />);
    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
  });

  it("rounds to whole numbers unless decimals are asked for", async () => {
    const { AnimatedNumber } = await import("./AnimatedNumber");
    render(<AnimatedNumber value={1.5} />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
  });

  it("keeps the fraction up to the requested decimals", async () => {
    const { AnimatedNumber } = await import("./AnimatedNumber");
    render(<AnimatedNumber value={1.25} decimals={2} />);
    await waitFor(() => expect(screen.getByText("1.25")).toBeInTheDocument());
  });
});
