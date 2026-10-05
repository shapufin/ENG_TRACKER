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

const renderDialog = (onSave = vi.fn().mockResolvedValue(undefined)) =>
  render(
    <CompleteEprStageDialog open onOpenChange={vi.fn()} stageLabel="Mid-year" onSave={onSave} />
  );

describe("CompleteEprStageDialog", () => {
  it("names the stage being completed", () => {
    renderDialog();
    expect(screen.getByText("Complete Mid-year")).toBeInTheDocument();
  });

  it("requires a summary before the stage can complete", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Complete stage" })).toBeDisabled();
  });

  it("sends the summary, reference and shared flag", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <CompleteEprStageDialog
        open
        onOpenChange={onOpenChange}
        stageLabel="Final review"
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText("Summary"), {
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
    render(
      <CompleteEprStageDialog
        open
        onOpenChange={onOpenChange}
        stageLabel="Goal setting"
        onSave={onSave}
      />
    );
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete stage" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
