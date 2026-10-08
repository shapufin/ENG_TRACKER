import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ChartCard } from "./ChartCard";

describe("ChartCard", () => {
  it("marks itself as a PDF capture section only when given a sectionId", () => {
    const { container, rerender } = render(<ChartCard title="A">x</ChartCard>);
    expect(container.querySelector("[data-chart-section]")).toBeNull();
    rerender(
      <ChartCard title="A" sectionId="ot-trend">
        x
      </ChartCard>
    );
    expect(container.querySelector("[data-chart-section='ot-trend']")).not.toBeNull();
  });

  it("lets the grid own the height and renders the action slot", () => {
    const { getByText } = render(
      <ChartCard title="A" action={<button>go</button>}>
        body
      </ChartCard>
    );
    expect(getByText("go")).toBeInTheDocument();
    const body = getByText("body");
    expect(body.className).toContain("min-h-0");
    expect(body.className).not.toContain("min-h-[220px]");
  });
});
