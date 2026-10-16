import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManageTeamsDialog } from "./ManageTeamsDialog";
import { GroupRenameDialog } from "./GroupRenameDialog";

const teams = [
  { id: 1, name: "Alpha", code: "A", calendar_group: "g1" },
  { id: 2, name: "Beta", code: "B", calendar_group: "" },
] as any;

describe("ManageTeamsDialog remove", () => {
  it("hands the team to onRemove and does not update it directly", () => {
    const onRemove = vi.fn();
    const onUpdateTeam = vi.fn();
    render(
      <ManageTeamsDialog
        open
        onOpenChange={vi.fn()}
        groupName="g1"
        teams={teams}
        onUpdateTeam={onUpdateTeam}
        onRemove={onRemove}
        isPending={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith(teams[0]);
    expect(onUpdateTeam).not.toHaveBeenCalled();
  });
});

describe("GroupRenameDialog preview", () => {
  const renderRename = (newGroupName: string) =>
    render(
      <GroupRenameDialog
        open
        onOpenChange={vi.fn()}
        editingGroup="old"
        newGroupName={newGroupName}
        onNewGroupNameChange={vi.fn()}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />
    );

  it("shows the name that will be saved when it differs from the input", () => {
    renderRename("MSC  SIAE");
    expect(screen.getByText('Will be saved as "msc-siae"')).toBeInTheDocument();
  });

  it("shows no preview when the input is already canonical", () => {
    renderRename("msc-siae");
    expect(screen.queryByText(/Will be saved as/)).toBeNull();
  });
});
