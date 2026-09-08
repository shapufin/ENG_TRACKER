import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Calendar, TrendingUp } from "lucide-react";
import { CalendarGroupInfoCard } from "./CalendarGroupInfoCard";

// Browser probe (dark): example title at 3.21:1 FAIL. Text nodes use
// text-foreground; the lead icon keeps text-primary (graphical, 3:1 bar).
describe("CalendarGroupInfoCard text contrast", () => {
  it("example title uses text-foreground, not text-primary", () => {
    render(
      <CalendarGroupInfoCard
        icon={Calendar}
        trackingLabel="Track"
        title="Title"
        description="Description"
        exampleTitle="Example"
        exampleText="Example body"
      />
    );
    const example = screen.getByText("Example");
    expect(example.className).toContain("text-foreground");
    expect(example.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });

  it("lead icon keeps text-primary", () => {
    const { container } = render(
      <CalendarGroupInfoCard
        icon={TrendingUp}
        trackingLabel="Track"
        title="Title"
        description="Description"
        exampleTitle="Example"
        exampleText="Example body"
      />
    );
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-primary");
  });
});
