import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CustomizeDashboardModal } from "./CustomizeDashboardModal";
import { LayoutDashboard } from "lucide-react";

const widgets = Array.from({ length: 12 }, (_, i) => ({
  id: `w${i}`,
  title: `Widget ${i}`,
  description: `Description ${i}`,
  icon: LayoutDashboard,
}));

// Scroll contract: the widget list scrolls in a viewport-capped region;
// header + Save footer stay visible. No fixed h-[400px] panels.
describe("CustomizeDashboardModal scroll contract", () => {
  it("dialog is a bounded flex column with a capped scrollable list", () => {
    render(
      <CustomizeDashboardModal
        open
        onOpenChange={vi.fn()}
        availableWidgets={widgets}
        activeWidgets={["w0"]}
        onToggleWidget={vi.fn()}
      />
    );
    expect(screen.getByText("Customize Dashboard")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).toContain("max-h-[90vh]");
    expect(dlg.innerHTML).not.toContain("h-[400px]");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
  });
});
