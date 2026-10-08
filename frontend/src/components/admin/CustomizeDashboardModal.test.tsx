import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Users } from "lucide-react";
import { CustomizeDashboardModal } from "./CustomizeDashboardModal";

const widgets = [
  { id: "total-users", title: "Total Users", description: "d1", icon: Users },
  { id: "pending-backlog", title: "Pending Backlog", description: "d2", icon: Users },
  { id: "users", title: "Users Management", description: "d3", icon: Users },
  { id: "unmapped-thing", title: "Unmapped", description: "d4", icon: Users },
];

const setup = (onToggleWidget = vi.fn(), onOpenChange = vi.fn()) => {
  render(
    <CustomizeDashboardModal
      open
      onOpenChange={onOpenChange}
      availableWidgets={widgets}
      activeWidgets={["total-users"]}
      onToggleWidget={onToggleWidget}
    />
  );
  return { onToggleWidget, onOpenChange };
};

describe("CustomizeDashboardModal", () => {
  it("groups widgets under their section heading, unknown ones under Other", () => {
    setup();
    const overview = screen.getByRole("group", { name: "Overview" });
    expect(within(overview).getByText("Total Users")).toBeInTheDocument();
    const approvals = screen.getByRole("group", { name: "Approvals" });
    expect(within(approvals).getByText("Pending Backlog")).toBeInTheDocument();
    const other = screen.getByRole("group", { name: "Other" });
    expect(within(other).getByText("Unmapped")).toBeInTheDocument();
  });

  it("omits sections that have no widgets", () => {
    setup();
    expect(screen.queryByRole("group", { name: "Leave" })).not.toBeInTheDocument();
  });

  it("toggling a checkbox only calls onToggleWidget", () => {
    const { onToggleWidget, onOpenChange } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pending Backlog" }));
    expect(onToggleWidget).toHaveBeenCalledWith("pending-backlog");
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
