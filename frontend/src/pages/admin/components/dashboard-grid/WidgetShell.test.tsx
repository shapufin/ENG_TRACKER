import { describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WidgetShell } from "./WidgetShell";

const setup = (editing: boolean, grabbed = false) => {
  const onRemove = vi.fn();
  const onGripKeyDown = vi.fn();
  render(
    <WidgetShell
      id="hours-trend"
      title="Hours"
      editing={editing}
      onRemove={onRemove}
      onGripKeyDown={onGripKeyDown}
      grabbed={grabbed}
    >
      <section data-chart-section="hours-trend">chart</section>
    </WidgetShell>
  );
  return { onRemove, onGripKeyDown };
};

describe("WidgetShell", () => {
  it("is invisible outside edit mode and leaves the widget root untouched", () => {
    setup(false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("chart")).toHaveAttribute("data-chart-section", "hours-trend");
  });

  it("shows labelled grip and remove buttons in edit mode, outside the card", () => {
    const { onRemove, onGripKeyDown } = setup(true);
    const grip = screen.getByRole("button", { name: "Move Hours" });
    expect(grip).toHaveClass("dashboard-grid-grip");
    expect(screen.getByText("chart").contains(grip)).toBe(false);
    fireEvent.keyDown(grip, { key: "ArrowUp", altKey: true });
    expect(onGripKeyDown).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove Hours" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("documents the keyboard path on the grip: shortcuts, a description and the grab state", () => {
    setup(true);
    const grip = screen.getByRole("button", { name: "Move Hours" });
    expect(grip).toHaveAttribute("aria-keyshortcuts", expect.stringContaining("Alt+ArrowDown"));
    expect(grip).toHaveAttribute("aria-pressed", "false");
    expect(grip).toHaveAccessibleDescription(/Press Enter to grab/);
  });

  it("shows the grabbed state", () => {
    setup(true, true);
    expect(screen.getByRole("button", { name: "Move Hours" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("marks the edit frame so forced-colors mode can outline it", () => {
    setup(true);
    expect(document.querySelector("[data-edit-frame]")).not.toBeNull();
    cleanup();
    setup(false);
    expect(document.querySelector("[data-edit-frame]")).toBeNull();
  });
});
