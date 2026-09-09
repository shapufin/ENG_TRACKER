import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamEditDialog } from "./TeamEditDialog";

// Mechanical pass: labels are associated with their controls.
describe("TeamEditDialog labels", () => {
  it("labels resolve to their inputs", () => {
    render(
      <TeamEditDialog
        open
        onOpenChange={vi.fn()}
        editingTeam={{ id: 1, name: "Alpha" } as any}
        formValue="none"
        onFormChange={vi.fn()}
        calendarGroups={[]}
        isSubmitting={false}
        onSubmit={(e) => e.preventDefault()}
      />
    );
    expect(screen.getByLabelText("Team")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    for (const label of [...dlg.querySelectorAll("label")]) {
      const target = label.getAttribute("for");
      expect(target, `label "${label.textContent}" has a for attribute`).toBeTruthy();
      expect(
        dlg.querySelector(`#${CSS.escape(target!)}`),
        `label "${label.textContent}" resolves to #${target}`
      ).not.toBeNull();
    }
  });
});
