import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserBulkCommandDrawer } from "./UserBulkCommandDrawer";

const profiles = [
  { id: 1, user: { username: "alice" } },
  { id: 2, user: { username: "bob" } },
] as any;

// Scroll contract: header + Apply footer stay visible; only the section
// stack scrolls. The 92vh whole-scroll shell is replaced by the standard
// 90vh flex-column contract.
describe("UserBulkCommandDrawer scroll contract", () => {
  it("dialog is a bounded flex column with a scrollable body and sticky footer", () => {
    render(
      <UserBulkCommandDrawer
        open
        onOpenChange={vi.fn()}
        selectedProfiles={profiles}
        teams={{ results: [] }}
        techs={{ results: [] }}
        onBulkUpdate={vi.fn()}
      />
    );
    expect(screen.getByText("Bulk edit users")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(dlg.className).toContain("max-h-[90vh]");
    expect(dlg.className).not.toContain("92vh");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".shrink-0").length).toBeGreaterThan(0);
  });
});
