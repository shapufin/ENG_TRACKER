import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EPRSection } from "./EPRSection";
import type { EPRCycle } from "../types/tlScorecard";

// Radix Checkbox (in the stage dialog) needs ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const cycleWithFewGoals: EPRCycle = {
  id: 1,
  user: 20,
  user_name: "Jane Doe",
  year: 2026,
  goal_setting_completed_at: null,
  mid_year_completed_at: null,
  final_review_completed_at: null,
  goals: [{ id: 1, cycle: 1, description: "Goal A" }],
  goal_count: 1,
};

const cycleWithFiveGoals: EPRCycle = { ...cycleWithFewGoals, id: 2, goal_count: 5 };

const completedCycle: EPRCycle = {
  ...cycleWithFiveGoals,
  id: 3,
  goal_setting_completed_at: "2026-03-01T00:00:00Z",
  stage_records: [
    {
      id: 7,
      cycle: 3,
      stage: "goal_setting",
      stage_display: "Goal setting",
      summary: "Five SMART goals agreed with Jane.",
      reference_url: "https://workday.example/goals/3",
      shared_with_employee: true,
      recorded_by: 9,
      recorded_by_name: "Enri Leader",
      created_at: "2026-03-01T10:00:00Z",
    },
  ],
};

describe("EPRSection", () => {
  it("shows an empty state with no cycles", () => {
    render(<EPRSection cycles={[]} onAddGoal={vi.fn()} onCompleteStage={vi.fn()} />);
    expect(screen.getByText("No EPR cycles started")).toBeInTheDocument();
  });

  it("disables Goal Setting completion with fewer than 5 goals", () => {
    render(
      <EPRSection cycles={[cycleWithFewGoals]} onAddGoal={vi.fn()} onCompleteStage={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Goal Setting" })).toBeDisabled();
  });

  it("opens the evidence dialog instead of completing on a bare click", async () => {
    const onCompleteStage = vi.fn().mockResolvedValue(undefined);
    render(
      <EPRSection
        cycles={[cycleWithFiveGoals]}
        onAddGoal={vi.fn()}
        onCompleteStage={onCompleteStage}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Goal Setting" }));

    // A stage is not completed without evidence: the click only opens the dialog.
    expect(onCompleteStage).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByLabelText(/^Summary/), {
      target: { value: "Goals agreed in the kickoff." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete stage" }));

    await waitFor(() =>
      expect(onCompleteStage).toHaveBeenCalledWith(2, {
        stage: "goal_setting",
        summary: "Goals agreed in the kickoff.",
        reference_url: "",
        shared_with_employee: false,
      })
    );
  });

  it("renders recorded evidence under a completed stage", () => {
    render(<EPRSection cycles={[completedCycle]} onAddGoal={vi.fn()} onCompleteStage={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Goal Setting/ })).toBeDisabled();
    expect(screen.getByText("Five SMART goals agreed with Jane.")).toBeInTheDocument();
    expect(screen.getByText("Shared with employee")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reference/i })).toHaveAttribute(
      "href",
      "https://workday.example/goals/3"
    );
  });

  it("adds a goal via the inline input", () => {
    const onAddGoal = vi.fn();
    render(
      <EPRSection cycles={[cycleWithFewGoals]} onAddGoal={onAddGoal} onCompleteStage={vi.fn()} />
    );
    fireEvent.change(screen.getByPlaceholderText("Add a goal..."), {
      target: { value: "Ship feature X" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAddGoal).toHaveBeenCalledWith(1, "Ship feature X");
  });
});
