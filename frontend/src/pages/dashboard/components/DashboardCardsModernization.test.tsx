import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TopBottlenecksCard } from "./TopBottlenecksCard";
import { QueueMixCard } from "./QueueMixCard";
import { MonthlyComparisonCard } from "./MonthlyComparisonCard";
import { PersonalDashboardLeavesCard } from "./PersonalDashboardLeavesCard";

const users = [{ userId: 1, userName: "Alice Example", count: 3 }];
const queueSegments = [
  { label: "Overtime", value: 2, percentage: 50, accent: "bg-accent-yellow" },
  { label: "Vacation", value: 2, percentage: 50, accent: "bg-accent-violet" },
];

const markupOf = (ui: React.ReactElement) => render(ui).container.innerHTML;

describe("dashboard card modernization", () => {
  it("does not use inline glass imitations (bare Card with bg-card/50 backdrop-blur)", () => {
    expect(
      markupOf(<TopBottlenecksCard users={users} isLoading={false} isError={false} />)
    ).not.toContain("bg-card/50");
    expect(
      markupOf(<QueueMixCard pendingTotal={4} pendingStandby={1} queueSegments={queueSegments} />)
    ).not.toContain("bg-card/50");
    expect(markupOf(<MonthlyComparisonCard />)).not.toContain("bg-card/50");
    expect(markupOf(<PersonalDashboardLeavesCard upcomingLeaves={[]} />)).not.toContain(
      "bg-card/50"
    );
  });

  it("does not use raw gradient overlays", () => {
    expect(markupOf(<PersonalDashboardLeavesCard upcomingLeaves={[]} />)).not.toContain(
      "from-violet-500/20"
    );
  });

  it("QueueMix pending badge does not use 1:1 text-primary on bg-primary/10", () => {
    expect(
      markupOf(<QueueMixCard pendingTotal={4} pendingStandby={1} queueSegments={queueSegments} />)
    ).not.toMatch(/bg-primary\/10[^"]*text-primary|text-primary[^"]*bg-primary\/10/);
  });
});
