import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EPRSection } from "./EPRSection";
import type { EPRCycle } from "../types/tlScorecard";

const cycleWithFewGoals: EPRCycle = {
  id: 1, user: 20, user_name: "Jane Doe", year: 2026,
  goal_setting_completed_at: null, mid_year_completed_at: null, final_review_completed_at: null,
  goals: [{ id: 1, cycle: 1, description: "Goal A" }], goal_count: 1,
};

const cycleWithFiveGoals: EPRCycle = { ...cycleWithFewGoals, id: 2, goal_count: 5 };

const completedCycle: EPRCycle = {
  ...cycleWithFiveGoals, id: 3, goal_setting_completed_at: "2026-03-01T00:00:00Z",
};

describe("EPRSection", () => {
  it("shows an empty state with no cycles", () => {
    render(<EPRSection cycles={[]} onAddGoal={vi.fn()} onCompleteStage={vi.fn()} />);
    expect(screen.getByText("No EPR cycles started")).toBeInTheDocument();
  });

  it("disables Goal Setting completion with fewer than 5 goals", () => {
    render(<EPRSection cycles={[cycleWithFewGoals]} onAddGoal={vi.fn()} onCompleteStage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Goal Setting" })).toBeDisabled();
  });

  it("enables Goal Setting completion with 5 goals and calls onCompleteStage", () => {
    const onCompleteStage = vi.fn();
    render(<EPRSection cycles={[cycleWithFiveGoals]} onAddGoal={vi.fn()} onCompleteStage={onCompleteStage} />);
    const button = screen.getByRole("button", { name: "Goal Setting" });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onCompleteStage).toHaveBeenCalledWith(2, "goal_setting");
  });

  it("disables an already-completed stage", () => {
    render(<EPRSection cycles={[completedCycle]} onAddGoal={vi.fn()} onCompleteStage={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Goal Setting/ })).toBeDisabled();
  });

  it("adds a goal via the inline input", () => {
    const onAddGoal = vi.fn();
    render(<EPRSection cycles={[cycleWithFewGoals]} onAddGoal={onAddGoal} onCompleteStage={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Add a goal..."), { target: { value: "Ship feature X" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAddGoal).toHaveBeenCalledWith(1, "Ship feature X");
  });
});
