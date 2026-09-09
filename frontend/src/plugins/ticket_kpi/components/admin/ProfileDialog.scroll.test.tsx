import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileDialog } from "./ProfileDialog";

// Scroll contract: the long profile form scrolls in the body while the
// title and the Create/Update footer stay visible.
describe("ProfileDialog scroll contract", () => {
  it("dialog is a bounded flex column with a scrollable body and sticky footer", () => {
    render(
      <ProfileDialog
        open
        onOpenChange={vi.fn()}
        profile={null}
        clients={[]}
        onSave={vi.fn()}
        isPending={false}
      />
    );
    expect(screen.getByText("Create Profile")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(dlg.className).not.toContain("bg-card");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".shrink-0").length).toBeGreaterThan(0);
  });
});
