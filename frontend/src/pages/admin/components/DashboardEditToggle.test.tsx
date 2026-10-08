import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardEditToggle } from "./DashboardEditToggle";

const setup = (props: Partial<React.ComponentProps<typeof DashboardEditToggle>> = {}) => {
  const onToggle = vi.fn();
  const onRetry = vi.fn();
  render(
    <DashboardEditToggle
      editing={false}
      disabled={false}
      onToggle={onToggle}
      saveStatus="idle"
      onRetry={onRetry}
      {...props}
    />
  );
  return { onToggle, onRetry };
};

describe("DashboardEditToggle", () => {
  it("toggles edit mode and becomes Done while editing", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit layout" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows Done (pressed) while editing", () => {
    setup({ editing: true });
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is aria-disabled with an explanation off the All tab, and does nothing", () => {
    const { onToggle } = setup({ disabled: true });
    const button = screen.getByRole("button", { name: "Edit layout" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Switch to All to rearrange widgets");
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("announces Saving…, Saved and a retryable failure", () => {
    const { rerender } = render(
      <DashboardEditToggle
        editing={false}
        disabled={false}
        onToggle={vi.fn()}
        saveStatus="saving"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    rerender(
      <DashboardEditToggle
        editing={false}
        disabled={false}
        onToggle={vi.fn()}
        saveStatus="saved"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("offers Retry when the save failed", () => {
    const { onRetry } = setup({ saveStatus: "error" });
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't save");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
