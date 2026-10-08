import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardPresetMenu } from "./DashboardPresetMenu";
import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";

const setup = (isSuperuser = false) => {
  const onApply = vi.fn();
  render(
    <DashboardPresetMenu
      availableWidgets={AVAILABLE_WIDGETS}
      isSuperuser={isSuperuser}
      onApply={onApply}
    />
  );
  return { onApply };
};

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: /presets/i }));

describe("DashboardPresetMenu", () => {
  it("lists presets with their descriptions", () => {
    setup();
    openMenu();
    expect(screen.getByRole("menuitem", { name: /Approver view/ })).toBeInTheDocument();
    expect(screen.getByText(/Pending queue, aging/)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Trends view/ })).toBeInTheDocument();
  });

  it("asks for confirmation naming the preset before applying anything", () => {
    const { onApply } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Approver view/ }));
    expect(screen.getByText(/Switch to “Approver view”\?/)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("applies the resolved widgets once on confirm", () => {
    const { onApply } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Approver view/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply preset" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual([
      "pending-approvals",
      "pending-backlog",
      "approval-aging",
      "approver-sla",
      "rejection-analysis",
      "period-close",
      "approval-status",
    ]);
  });

  it("cancel leaves the layout alone", () => {
    const { onApply } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Workforce view/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onApply).not.toHaveBeenCalled();
  });
});
