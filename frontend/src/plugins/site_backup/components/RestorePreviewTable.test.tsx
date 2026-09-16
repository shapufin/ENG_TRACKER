import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RestorePreviewTable } from "./RestorePreviewTable";
import type { RestoreModelGroup } from "../types/siteBackup";

const modelGroups: RestoreModelGroup[] = [
  {
    model: "auth.group",
    file_count: 2,
    db_count: 2,
    new: 1,
    overwritten: 1,
    db_only: 1,
    forced_dependents: ["auth.permission"],
  },
  {
    model: "auth.permission",
    file_count: 5,
    db_count: 5,
    new: 0,
    overwritten: 5,
    db_only: 0,
    forced_dependents: [],
  },
];

describe("RestorePreviewTable", () => {
  it("shows an empty message when there are no model groups", () => {
    render(
      <RestorePreviewTable
        modelGroups={[]}
        approvedModels={new Set()}
        onToggleApprove={vi.fn()}
        deleteMissingModels={new Set()}
        onToggleDeleteMissing={vi.fn()}
      />
    );
    expect(screen.getByText(/no rows to restore/i)).toBeInTheDocument();
  });

  it("calls onToggleApprove when a model's checkbox is clicked", () => {
    const onToggleApprove = vi.fn();
    render(
      <RestorePreviewTable
        modelGroups={modelGroups}
        approvedModels={new Set()}
        onToggleApprove={onToggleApprove}
        deleteMissingModels={new Set()}
        onToggleDeleteMissing={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Restore auth.group" }));
    expect(onToggleApprove).toHaveBeenCalledWith("auth.group");
  });

  it("renders a forced dependent as checked and disabled once its parent is approved", () => {
    render(
      <RestorePreviewTable
        modelGroups={modelGroups}
        approvedModels={new Set(["auth.group"])}
        onToggleApprove={vi.fn()}
        deleteMissingModels={new Set()}
        onToggleDeleteMissing={vi.fn()}
      />
    );
    const forcedCheckbox = screen.getByRole("checkbox", { name: "Restore auth.permission" });
    expect(forcedCheckbox).toBeDisabled();
    expect(forcedCheckbox).toHaveAttribute("data-state", "checked");
    expect(screen.getByText("Required by an approved model")).toBeInTheDocument();
  });

  it("disables the delete-missing checkbox until the model itself is approved", () => {
    render(
      <RestorePreviewTable
        modelGroups={modelGroups}
        approvedModels={new Set()}
        onToggleApprove={vi.fn()}
        deleteMissingModels={new Set()}
        onToggleDeleteMissing={vi.fn()}
      />
    );
    expect(
      screen.getByRole("checkbox", {
        name: "Also delete rows missing from the backup for auth.group",
      })
    ).toBeDisabled();
  });

  it("enables and toggles the delete-missing checkbox once approved", () => {
    const onToggleDeleteMissing = vi.fn();
    render(
      <RestorePreviewTable
        modelGroups={modelGroups}
        approvedModels={new Set(["auth.group"])}
        onToggleApprove={vi.fn()}
        deleteMissingModels={new Set()}
        onToggleDeleteMissing={onToggleDeleteMissing}
      />
    );
    const deleteMissingCheckbox = screen.getByRole("checkbox", {
      name: "Also delete rows missing from the backup for auth.group",
    });
    expect(deleteMissingCheckbox).not.toBeDisabled();
    fireEvent.click(deleteMissingCheckbox);
    expect(onToggleDeleteMissing).toHaveBeenCalledWith("auth.group");
  });

  it("shows n/a for delete-missing when there are no db-only rows", () => {
    render(
      <RestorePreviewTable
        modelGroups={modelGroups}
        approvedModels={new Set(["auth.permission"])}
        onToggleApprove={vi.fn()}
        deleteMissingModels={new Set()}
        onToggleDeleteMissing={vi.fn()}
      />
    );
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });
});
