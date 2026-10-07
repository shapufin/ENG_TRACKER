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

const goals = ["Goal A", "Goal B", "Goal C", "Goal D", "Goal E"].map((description, index) => ({
  id: index + 1,
  cycle: 1,
  description,
}));

const cycleWithFewGoals: EPRCycle = {
  id: 1,
  user: 20,
  user_name: "Jane Doe",
  year: 2026,
  goal_setting_completed_at: null,
  mid_year_completed_at: null,
  final_review_completed_at: null,
  goals: goals.slice(0, 1),
  goal_count: 1,
};

const cycleWithFiveGoals: EPRCycle = {
  ...cycleWithFewGoals,
  id: 2,
  goals,
  goal_count: 5,
};

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

const renderSection = (
  cycles: EPRCycle[],
  onCompleteStage = vi.fn().mockResolvedValue(undefined),
  onParseGoals = vi.fn().mockResolvedValue(goals.map((goal) => goal.description))
) =>
  render(
    <EPRSection cycles={cycles} onParseGoals={onParseGoals} onCompleteStage={onCompleteStage} />
  );

describe("EPRSection", () => {
  it("shows an empty state with no cycles", () => {
    renderSection([]);
    expect(screen.getByText("No EPR cycles started")).toBeInTheDocument();
  });

  it("lets Goal Setting open with fewer than five goals so they can be confirmed", () => {
    renderSection([cycleWithFewGoals]);
    expect(screen.getByText("1/5 confirmed goals")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete Goal Setting" }));
    expect(screen.getByText("Complete Goal Setting")).toBeInTheDocument();
    expect(screen.getByLabelText(/Workday PDF/i)).toBeInTheDocument();
  });

  it("opens the evidence dialog instead of completing on a bare click", async () => {
    const onCompleteStage = vi.fn().mockResolvedValue(undefined);
    renderSection([cycleWithFiveGoals], onCompleteStage);
    fireEvent.click(screen.getByRole("button", { name: "Complete Goal Setting" }));

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
        goal_titles: goals.map((goal) => goal.description),
      })
    );
  });

  it("renders recorded evidence under a completed stage", () => {
    renderSection([completedCycle]);
    expect(screen.queryByRole("button", { name: /Goal Setting/ })).not.toBeInTheDocument();
    expect(screen.getByText(/^Completed /)).toBeInTheDocument();
    expect(screen.getByText("Five SMART goals agreed with Jane.")).toBeInTheDocument();
    expect(screen.getByText("Shared with employee")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reference/i })).toHaveAttribute(
      "href",
      "https://workday.example/goals/3"
    );
  });

  it("disables later stages until the earlier one is complete", () => {
    renderSection([cycleWithFewGoals]);

    expect(screen.getByRole("button", { name: /Goal Setting/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Mid-year/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Final Review/ })).not.toBeInTheDocument();
    expect(screen.getByText("Ready to complete")).toBeInTheDocument();
    expect(screen.getAllByText("Locked until the previous step is done")).toHaveLength(2);
    expect(screen.getByText(/Step 1 · Current/)).toBeInTheDocument();
  });

  it("explains a step blocked by a later completed step", () => {
    renderSection([{ ...cycleWithFewGoals, mid_year_completed_at: "2026-07-01T00:00:00Z" }]);

    expect(screen.getByRole("button", { name: /Goal Setting/ })).toBeDisabled();
    expect(screen.getByText("Blocked — a later step is already complete")).toBeInTheDocument();
  });

  it("lets an out-of-order step record evidence when goals are already confirmed", () => {
    renderSection([{ ...cycleWithFiveGoals, mid_year_completed_at: "2026-07-01T00:00:00Z" }]);

    const button = screen.getByRole("button", { name: /Goal Setting/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(screen.getByText(/the goals are locked/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Workday PDF")).not.toBeInTheDocument();
  });

  it("unlocks the next stage as each one completes", () => {
    renderSection([
      {
        ...cycleWithFiveGoals,
        goal_setting_completed_at: "2026-03-01T00:00:00Z",
        mid_year_completed_at: "2026-07-01T00:00:00Z",
      },
    ]);

    expect(screen.queryByRole("button", { name: /Mid-year/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Final Review/ })).toBeEnabled();
  });

  it("threads the PDF parse callback with cycle and stage", async () => {
    const onParseGoals = vi
      .fn()
      .mockResolvedValue(["Parsed A", "Parsed B", "Parsed C", "Parsed D", "Parsed E"]);
    renderSection([cycleWithFewGoals], undefined, onParseGoals);

    fireEvent.click(screen.getByRole("button", { name: "Complete Goal Setting" }));
    const file = new File(["%PDF-1.4"], "workday.pdf", { type: "application/pdf" });
    fireEvent.change(await screen.findByLabelText(/Workday PDF/i), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onParseGoals).toHaveBeenCalledWith(1, "goal_setting", file));
  });

  it("passes existing titles to Mid-year and omits goal_titles when unchanged", async () => {
    const onCompleteStage = vi.fn().mockResolvedValue(undefined);
    renderSection(
      [{ ...cycleWithFiveGoals, goal_setting_completed_at: "2026-03-01T00:00:00Z" }],
      onCompleteStage
    );

    fireEvent.click(screen.getByRole("button", { name: "Complete Mid-year" }));
    expect(await screen.findByDisplayValue("Goal A")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Summary/), {
      target: { value: "No Workday changes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete stage" }));

    await waitFor(() =>
      expect(onCompleteStage).toHaveBeenCalledWith(2, {
        stage: "mid_year",
        summary: "No Workday changes.",
        reference_url: "",
        shared_with_employee: false,
      })
    );
  });
});
