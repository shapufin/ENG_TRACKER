import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Users } from "lucide-react";
import { CustomizeDashboardModal } from "./CustomizeDashboardModal";
import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";

const widgets = [
  { id: "kpi-strip", title: "Key Figures", description: "d1", icon: Users },
  { id: "approval-queue", title: "Approval Queue", description: "d2", icon: Users },
  { id: "shortcuts", title: "Shortcuts", description: "d3", icon: Users },
  { id: "unmapped-thing", title: "Unmapped", description: "d4", icon: Users },
];

const setup = (onToggleWidget = vi.fn(), onOpenChange = vi.fn()) => {
  render(
    <CustomizeDashboardModal
      open
      onOpenChange={onOpenChange}
      availableWidgets={widgets}
      activeWidgets={["kpi-strip"]}
      onToggleWidget={onToggleWidget}
    />
  );
  return { onToggleWidget, onOpenChange };
};

describe("CustomizeDashboardModal", () => {
  it("groups widgets under their section heading, unknown ones under Other", () => {
    setup();
    const overview = screen.getByRole("group", { name: "Overview" });
    expect(within(overview).getByText("Key Figures")).toBeInTheDocument();
    const approvals = screen.getByRole("group", { name: "Approvals" });
    expect(within(approvals).getByText("Approval Queue")).toBeInTheDocument();
    const other = screen.getByRole("group", { name: "Other" });
    expect(within(other).getByText("Unmapped")).toBeInTheDocument();
  });

  it("omits sections that have no widgets", () => {
    setup();
    expect(screen.queryByRole("group", { name: "Leave" })).not.toBeInTheDocument();
  });

  it("toggling a checkbox only calls onToggleWidget", () => {
    const { onToggleWidget, onOpenChange } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Approval Queue" }));
    expect(onToggleWidget).toHaveBeenCalledWith("approval-queue");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("has a single Done button and no Save Changes", () => {
    const { onOpenChange } = setup();
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not promise drag and drop", () => {
    setup();
    expect(screen.queryByText(/drag/i)).not.toBeInTheDocument();
  });
});

describe("CustomizeDashboardModal with the real widget list", () => {
  it("shows every merged widget under its section and nothing under Other", () => {
    render(
      <CustomizeDashboardModal
        open
        onOpenChange={vi.fn()}
        availableWidgets={AVAILABLE_WIDGETS}
        activeWidgets={["kpi-strip"]}
        onToggleWidget={vi.fn()}
      />
    );
    const inGroup = (group: string, title: string) =>
      within(screen.getByRole("group", { name: group })).getByRole("checkbox", { name: title });
    expect(inGroup("Overview", "Key Figures")).toBeChecked();
    expect(inGroup("Overview", "People Mix")).not.toBeChecked();
    expect(inGroup("Approvals", "Approval Queue")).toBeInTheDocument();
    expect(inGroup("Hours & Trends", "Hours")).toBeInTheDocument();
    expect(inGroup("Shortcuts", "Shortcuts")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Other" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(AVAILABLE_WIDGETS.length);
  });
});
