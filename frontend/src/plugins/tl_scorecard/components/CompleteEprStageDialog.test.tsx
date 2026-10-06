import type React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompleteEprStageDialog } from "./CompleteEprStageDialog";

// Radix Checkbox needs ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const FIVE_TITLES = ["Goal A", "Goal B", "Goal C", "Goal D", "Goal E"];
const PDF_FILE = new File(["%PDF-1.4"], "workday-goals.pdf", {
  type: "application/pdf",
});

const renderDialog = (
  overrides: Partial<React.ComponentProps<typeof CompleteEprStageDialog>> = {}
) => {
  const onSave = overrides.onSave ?? vi.fn().mockResolvedValue(undefined);
  return render(
    <CompleteEprStageDialog
      open
      onOpenChange={vi.fn()}
      stage="mid_year"
      stageLabel="Mid-year"
      initialGoalTitles={FIVE_TITLES}
      onParseGoals={vi.fn().mockResolvedValue(FIVE_TITLES)}
      onSave={onSave}
      {...overrides}
    />
  );
};

const fillSummary = () =>
  fireEvent.change(screen.getByLabelText(/^Summary/), {
    target: { value: "Evidence summary." },
  });

describe("CompleteEprStageDialog", () => {
  it("names the stage being completed", () => {
    renderDialog();
    expect(screen.getByText("Complete Mid-year")).toBeInTheDocument();
  });

  it("requires a summary before the stage can complete", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Complete stage" })).toBeDisabled();
  });

  it("sends the summary, reference and shared flag without goal_titles for final review", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <CompleteEprStageDialog
        open
        onOpenChange={onOpenChange}
        stage="final_review"
        stageLabel="Final review"
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText(/^Summary/), {
      target: { value: "Year-end rating agreed; promotion case opened." },
    });
    fireEvent.change(screen.getByLabelText("Reference link"), {
      target: { value: "https://workday.example/review/42" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /share with employee/i }));
    fireEvent.click(screen.getByRole("button", { name: "Complete stage" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        summary: "Year-end rating agreed; promotion case opened.",
        reference_url: "https://workday.example/review/42",
        shared_with_employee: true,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open when the save fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("nope"));
    const onOpenChange = vi.fn();
    renderDialog({ stage: "goal_setting", stageLabel: "Goal setting", onSave, onOpenChange });
    fillSummary();
    fireEvent.click(screen.getByRole("button", { name: "Complete stage" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("lets Goal Setting upload a PDF and preview the parsed titles without saving", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onParseGoals = vi
      .fn()
      .mockResolvedValue([
        "Backlog Reduction",
        "AI Adoption",
        "Ticket Bounce/Reassignment Rate",
        "Microsoft High-Severity Incident Prevention",
        "Performance and Quality of Operational Activities",
      ]);
    renderDialog({
      stage: "goal_setting",
      stageLabel: "Goal setting",
      initialGoalTitles: [],
      onParseGoals,
      onSave,
    });

    fireEvent.change(screen.getByLabelText(/Workday PDF/i), {
      target: { files: [PDF_FILE] },
    });

    await waitFor(() => {
      expect(onParseGoals).toHaveBeenCalledWith(PDF_FILE);
      expect(screen.getByDisplayValue("Backlog Reduction")).toBeInTheDocument();
      expect(screen.getByText("5 goals ready to confirm")).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("allows goal titles to be edited, added and removed before confirmation", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({ stage: "goal_setting", stageLabel: "Goal setting", onSave });

    fireEvent.change(screen.getByLabelText("Goal 1"), {
      target: { value: "Renamed goal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));
    fireEvent.change(screen.getByLabelText("Goal 6"), {
      target: { value: "Extra goal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove Goal 2" }));
    fillSummary();
    fireEvent.click(screen.getByRole("button", { name: "Complete stage" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          goal_titles: ["Renamed goal", "Goal C", "Goal D", "Goal E", "Extra goal"],
        })
      )
    );
  });

  it("blocks Goal Setting while fewer than five goals are present", () => {
    renderDialog({
      stage: "goal_setting",
      stageLabel: "Goal setting",
      initialGoalTitles: FIVE_TITLES.slice(0, 4),
    });
    fillSummary();
    expect(screen.getByRole("button", { name: "Complete stage" })).toBeDisabled();
    expect(screen.getByText("4/5 goals ready")).toBeInTheDocument();
  });

  it("keeps the dialog open and shows an error when PDF parsing fails", async () => {
    const onParseGoals = vi.fn().mockRejectedValue(new Error("unreadable"));
    const onOpenChange = vi.fn();
    renderDialog({
      stage: "goal_setting",
      stageLabel: "Goal setting",
      initialGoalTitles: [],
      onParseGoals,
      onOpenChange,
    });

    fireEvent.change(screen.getByLabelText(/Workday PDF/i), {
      target: { files: [PDF_FILE] },
    });

    expect(await screen.findByText("unreadable")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("omits goal_titles when Mid-year confirms the existing goal set", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onSave });
    fillSummary();
    fireEvent.click(screen.getByRole("button", { name: "Complete stage" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        summary: "Evidence summary.",
        reference_url: "",
        shared_with_employee: false,
      })
    );
  });

  it("sends goal_titles when Mid-year uploads a replacement PDF", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onParseGoals = vi.fn().mockResolvedValue(["New A", "New B", "New C", "New D", "New E"]);
    renderDialog({ onSave, onParseGoals });

    fireEvent.change(screen.getByLabelText(/Workday PDF/i), {
      target: { files: [PDF_FILE] },
    });
    await screen.findByDisplayValue("New A");
    fillSummary();
    fireEvent.click(screen.getByRole("button", { name: "Complete stage" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          goal_titles: ["New A", "New B", "New C", "New D", "New E"],
        })
      )
    );
  });

  it("shows no goal controls during Final review", () => {
    renderDialog({ stage: "final_review", stageLabel: "Final review" });
    expect(screen.queryByLabelText(/Workday PDF/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Goal 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add goal" })).not.toBeInTheDocument();
  });
});
