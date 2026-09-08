import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalDashboardPendingCard } from "./PersonalDashboardPendingCard";

describe("PersonalDashboardPendingCard", () => {
  it("renders an icon-centered empty state when there are no pending items", () => {
    const { container } = render(<PersonalDashboardPendingCard personalPendingItems={[]} />);

    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
