import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

  it("shows Done while editing and signals state by label only, not aria-pressed", () => {
    setup({ editing: true });
    expect(screen.getByRole("button", { name: "Done" })).not.toHaveAttribute("aria-pressed");
  });

  it("is aria-disabled with an explanation off the All tab, and does nothing", () => {
    const { onToggle } = setup({ disabled: true });
    const button = screen.getByRole("button", { name: "Edit layout" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Switch to All to rearrange widgets");
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("exposes the reason to assistive tech, looks disabled and stays focusable", () => {
    setup({ disabled: true });
    const button = screen.getByRole("button", { name: "Edit layout" });
    expect(button).toHaveAccessibleDescription("Switch to All to rearrange widgets");
    expect(button).toHaveClass("aria-disabled:opacity-50");
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
  });

  it("describes a custom reason", () => {
    setup({ disabled: true, disabledReason: "Loading your layout…" });
    expect(screen.getByRole("button", { name: "Edit layout" })).toHaveAccessibleDescription(
      "Loading your layout…"
    );
  });

  it("has no description when enabled", () => {
    setup();
    expect(screen.getByRole("button", { name: "Edit layout" })).not.toHaveAttribute(
      "aria-describedby"
    );
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

  describe("Saved fades", () => {
    afterEach(() => vi.useRealTimers());

    it("clears the Saved text after a few seconds and shows it again on the next save", () => {
      vi.useFakeTimers();
      const props = { editing: false, disabled: false, onToggle: vi.fn(), onRetry: vi.fn() };
      const { rerender } = render(<DashboardEditToggle {...props} saveStatus="saved" />);
      expect(screen.getByRole("status")).toHaveTextContent("Saved");
      act(() => {
        vi.advanceTimersByTime(3100);
      });
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      rerender(<DashboardEditToggle {...props} saveStatus="saving" />);
      rerender(<DashboardEditToggle {...props} saveStatus="saved" />);
      expect(screen.getByRole("status")).toHaveTextContent("Saved");
    });

    it("cancels the timer on unmount", () => {
      vi.useFakeTimers();
      const { unmount } = render(
        <DashboardEditToggle
          editing={false}
          disabled={false}
          onToggle={vi.fn()}
          onRetry={vi.fn()}
          saveStatus="saved"
        />
      );
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
