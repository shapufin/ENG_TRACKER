import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./StatCard";

// Design-system contract: metric numerals use the mono/tabular treatment
// (JetBrains Mono + tabular-nums) like the shared ui/StatCard, so multi-card
// rows align vertically in both themes.
describe("calendar StatCard", () => {
  it("renders the value with font-mono tabular-nums numerals", () => {
    render(
      <StatCard
        icon={<span data-testid="icon" />}
        label="Leave Used"
        value="12.5"
        suffix="days"
        sub="of 22 total"
        progress={57}
        color="bg-primary"
      />
    );

    const value = screen.getByText("12.5");
    expect(value.className).toContain("font-mono");
    expect(value.className).toContain("tabular-nums");

    const percent = screen.getByText("57%");
    expect(percent.className).toContain("tabular-nums");
  });

  it("keeps the Obsidian-Slate surface tokens", () => {
    render(
      <StatCard
        icon={<span data-testid="icon" />}
        label="Leave Used"
        value="12.5"
        suffix="days"
        sub="of 22 total"
        progress={57}
        color="bg-primary"
      />
    );

    const card = screen.getByText("12.5").closest("div.rounded-3xl") as HTMLElement;
    expect(card.className).toContain("bg-surface-sunken");
    expect(card.className).toContain("border-line-subtle");
  });
});
