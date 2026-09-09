import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GroupRenameDialog } from "./GroupRenameDialog";

const renderDialog = () =>
  render(
    <GroupRenameDialog
      open
      onOpenChange={vi.fn()}
      editingGroup="g1"
      newGroupName=""
      onNewGroupNameChange={vi.fn()}
      isSubmitting={false}
      onSubmit={(e) => e.preventDefault()}
    />
  );

// Mechanical pass: default popover surface + wired labels.
describe("GroupRenameDialog labels", () => {
  it("labels are associated with their inputs", () => {
    renderDialog();
    expect(screen.getByLabelText("Current Group Name")).toBeInTheDocument();
    expect(screen.getByLabelText("New Group Name")).toBeInTheDocument();
  });

  it("uses the default popover surface, not bg-card", () => {
    renderDialog();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).not.toContain("bg-card");
  });

  it("keeps the scroll contract (sticky header, scrollable body)", () => {
    renderDialog();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toMatch(/(^|\s)overflow-y-auto/);
    expect(dlg.querySelector(".flex-1.overflow-y-auto")).not.toBeNull();
  });
});
