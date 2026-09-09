import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BulkSkillAddDialog } from "./BulkSkillAddDialog";

const category = { id: 3, name: "BACKEND", code: "BACKEND" } as any;

// Scroll contract: unbounded row growth scrolls in ONE body region; the
// Add-row action and the footer stay reachable (no nested 50vh trap).
describe("BulkSkillAddDialog scroll contract", () => {
  it("dialog is a bounded flex column with a single scrollable body", () => {
    render(
      <BulkSkillAddDialog
        open
        category={category}
        existingSkills={[]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText("Add skills to BACKEND")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).toContain("max-h-[90vh]");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(dlg.innerHTML).not.toContain("max-h-[50vh]");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
  });
});
