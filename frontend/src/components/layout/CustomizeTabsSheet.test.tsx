import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CustomizeTabsSheet } from "./CustomizeTabsSheet";
import type { NavItem } from "./hooks/useVisibleNavItems";

const item = (path: string, label: string) =>
  ({ path, label, icon: () => null }) as unknown as NavItem;
const items = [
  item("/dashboard", "Dashboard"),
  item("/overtime", "Overtime"),
  item("/standby", "Standby"),
  item("/leave-management", "Leave"),
  item("/calendar", "Calendar"),
];

const renderSheet = (pinnedPaths: string[], extra = {}) => {
  const onSave = vi.fn();
  const onReset = vi.fn();
  render(
    <CustomizeTabsSheet
      open
      onOpenChange={vi.fn()}
      items={items}
      pinnedPaths={pinnedPaths}
      customized={false}
      onSave={onSave}
      onReset={onReset}
      {...extra}
    />
  );
  return { onSave, onReset };
};

describe("CustomizeTabsSheet", () => {
  it("is a phone bottom sheet listing each page with its current pin state", () => {
    renderSheet(["/dashboard", "/overtime", "/standby"]);

    expect(screen.getByRole("dialog").className).toContain("max-md:bottom-0");
    expect(screen.getByRole("checkbox", { name: "Dashboard" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Calendar" })).not.toBeChecked();
  });

  it("allows at most four and at least three pinned pages", () => {
    renderSheet(["/dashboard", "/overtime", "/standby", "/leave-management"]);

    expect(screen.getByRole("checkbox", { name: "Calendar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Leave" }));
    expect(screen.getByRole("checkbox", { name: "Calendar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Standby" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Pick 3 or 4 pages")).toBeInTheDocument();
  });

  it("saves the selection in page order", () => {
    const { onSave } = renderSheet(["/dashboard", "/overtime", "/standby"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(["/dashboard", "/overtime", "/standby", "/calendar"]);
  });

  it("offers reset only after the bar was customised", () => {
    renderSheet(["/dashboard", "/overtime", "/standby"]);
    expect(screen.queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
  });

  it("resets to the defaults", () => {
    const { onReset } = renderSheet(["/dashboard", "/overtime", "/standby"], { customized: true });
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
