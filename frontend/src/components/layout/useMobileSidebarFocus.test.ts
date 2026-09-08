import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMobileSidebarFocus } from "./useMobileSidebarFocus";

function createRefs() {
  return {
    containerRef: { current: null } as React.RefObject<HTMLElement | null>,
    closeButtonRef: { current: null } as React.RefObject<HTMLButtonElement | null>,
    triggerRef: { current: null } as React.RefObject<HTMLButtonElement | null>,
  };
}

describe("useMobileSidebarFocus", () => {
  it("closes on Escape and returns focus to the menu trigger", () => {
    const onClose = vi.fn();
    const refs = createRefs();
    const trigger = document.createElement("button");
    const close = document.createElement("button");
    const container = document.createElement("aside");
    container.append(close);
    document.body.append(trigger, container);
    refs.triggerRef.current = trigger;
    refs.closeButtonRef.current = close;
    refs.containerRef.current = container;
    trigger.focus();

    const { unmount } = renderHook(() => useMobileSidebarFocus({ open: true, onClose, ...refs }));

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    container.remove();
  });
});
