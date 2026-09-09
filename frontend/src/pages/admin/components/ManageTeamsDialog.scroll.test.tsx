import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ManageTeamsDialog } from "./ManageTeamsDialog";

const teams = [
  { id: 1, name: "Alpha", code: "A", calendar_group: "g1" },
  { id: 2, name: "Beta", code: "B", calendar_group: "" },
] as any;

// Scroll contract: the team lists scroll in a viewport-capped region under
// a sticky header. No fixed max-h-[400px] panels, default popover surface.
describe("ManageTeamsDialog scroll contract", () => {
  it("dialog is a bounded flex column with a capped scrollable list", () => {
    render(
      <ManageTeamsDialog
        open
        onOpenChange={vi.fn()}
        groupName="g1"
        teams={teams}
        onUpdateTeam={vi.fn()}
        isPending={false}
      />
    );
    expect(screen.getByText('Manage Teams in "g1"')).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).toContain("max-h-[90vh]");
    expect(dlg.className).not.toContain("bg-card");
    expect(dlg.innerHTML).not.toContain("max-h-[400px]");
    expect(document.querySelectorAll(".overflow-y-auto").length).toBeGreaterThan(0);
  });
});
