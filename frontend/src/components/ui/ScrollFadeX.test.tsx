import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScrollFadeX } from "./ScrollFadeX";

const setMetrics = (el: HTMLElement, m: { scrollWidth: number; clientWidth: number }) => {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: m.scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: m.clientWidth });
};

describe("ScrollFadeX", () => {
  it("fades only the edge that still has hidden content", () => {
    render(
      <ScrollFadeX data-testid="strip">
        <span>tabs</span>
      </ScrollFadeX>
    );
    const strip = screen.getByTestId("strip");
    setMetrics(strip, { scrollWidth: 600, clientWidth: 300 });

    fireEvent.scroll(strip, { target: { scrollLeft: 0 } });
    expect(strip).toHaveAttribute("data-fade-end", "true");
    expect(strip).toHaveAttribute("data-fade-start", "false");

    fireEvent.scroll(strip, { target: { scrollLeft: 150 } });
    expect(strip).toHaveAttribute("data-fade-start", "true");
    expect(strip).toHaveAttribute("data-fade-end", "true");

    fireEvent.scroll(strip, { target: { scrollLeft: 300 } });
    expect(strip).toHaveAttribute("data-fade-start", "true");
    expect(strip).toHaveAttribute("data-fade-end", "false");
  });

  it("shows no fade when the content fits", () => {
    render(<ScrollFadeX data-testid="strip">x</ScrollFadeX>);
    const strip = screen.getByTestId("strip");
    setMetrics(strip, { scrollWidth: 300, clientWidth: 300 });
    fireEvent.scroll(strip);
    expect(strip).toHaveAttribute("data-fade-end", "false");
    expect(strip).toHaveAttribute("data-fade-start", "false");
  });
});
