import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserStatsStrip } from "./UserStatsStrip";

const stats = {
  total_users: 12,
  italian_tl_count: 3,
  albanian_tl_count: 2,
  no_tl_count: 1,
  active_today_count: 9,
};

describe("UserStatsStrip", () => {
  it("shows the five user stats as label/value pairs in one strip", () => {
    render(<UserStatsStrip stats={stats} />);
    const pairs: [string, string][] = [
      ["Total users", "12"],
      ["Italian TL", "3"],
      ["Albanian TL", "2"],
      ["No TL", "1"],
      ["Active today", "9"],
    ];
    for (const [label, value] of pairs) {
      const term = screen.getByText(label);
      expect(term.tagName).toBe("DT");
      expect(term.nextElementSibling).toHaveTextContent(value);
    }
  });

  it("is a single list, not a grid of cards", () => {
    const { container } = render(<UserStatsStrip stats={stats} />);
    expect(container.querySelectorAll("dl")).toHaveLength(1);
    expect(container.querySelector(".grid")).toBeNull();
    expect(container.querySelectorAll(".tabular-nums")).toHaveLength(5);
  });
});
