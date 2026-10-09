import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { gripIntent, useGridKeyboard } from "./useGridKeyboard";
import type { GridItem } from "./gridLayout";

type Mods = Partial<Record<"alt" | "shift" | "ctrl" | "meta", boolean>>;

const key = (k: string, mods: Mods = {}) => ({
  key: k,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
});

describe("gripIntent", () => {
  it("Alt+Arrow moves and Alt+Shift+Arrow resizes, grabbed or not", () => {
    expect(gripIntent(key("ArrowLeft", { alt: true }), false)).toEqual({
      type: "step",
      dir: "left",
      resize: false,
    });
    expect(gripIntent(key("ArrowDown", { alt: true, shift: true }), true)).toEqual({
      type: "step",
      dir: "down",
      resize: true,
    });
  });

  it("plain arrows do nothing until the widget is grabbed", () => {
    expect(gripIntent(key("ArrowDown"), false)).toBeNull();
    expect(gripIntent(key("ArrowDown"), true)).toEqual({
      type: "step",
      dir: "down",
      resize: false,
    });
    expect(gripIntent(key("ArrowRight", { shift: true }), true)).toEqual({
      type: "step",
      dir: "right",
      resize: true,
    });
  });

  it("Enter and Space grab, then drop; Escape drops only while grabbed", () => {
    expect(gripIntent(key("Enter"), false)).toEqual({ type: "toggle-grab" });
    expect(gripIntent(key(" "), false)).toEqual({ type: "toggle-grab" });
    expect(gripIntent(key("Enter"), true)).toEqual({ type: "drop" });
    expect(gripIntent(key(" "), true)).toEqual({ type: "drop" });
    expect(gripIntent(key("Escape"), true)).toEqual({ type: "drop" });
    expect(gripIntent(key("Escape"), false)).toBeNull();
  });

  it("never claims Ctrl or Meta combinations", () => {
    expect(gripIntent(key("ArrowLeft", { ctrl: true }), true)).toBeNull();
    expect(gripIntent(key("ArrowLeft", { meta: true, alt: true }), false)).toBeNull();
    expect(gripIntent(key("Enter", { ctrl: true }), false)).toBeNull();
  });

  it("ignores Alt+Enter so browser and OS shortcuts keep working", () => {
    expect(gripIntent(key("Enter", { alt: true }), false)).toBeNull();
  });
});

const items: GridItem[] = [
  { i: "a", x: 0, y: 0, w: 4, h: 2, minW: 2, minH: 2 },
  { i: "b", x: 4, y: 0, w: 4, h: 2, minW: 2, minH: 2 },
];

describe("useGridKeyboard grab mode", () => {
  const setup = () => {
    const onChange = vi.fn();
    const hook = renderHook(() =>
      useGridKeyboard({ items, cols: 12, titleOf: (id) => id.toUpperCase(), onChange })
    );
    const press = (id: string, k: string, mods: Mods = {}) => {
      const preventDefault = vi.fn();
      act(() => {
        hook.result.current.onGripKeyDown(id)({ ...key(k, mods), preventDefault } as never);
      });
      return preventDefault;
    };
    return { ...hook, onChange, press };
  };

  it("grabs with Enter, resizes with Shift+arrows, and drops with Escape", () => {
    const { result, onChange, press } = setup();
    press("a", "ArrowRight");
    expect(onChange).not.toHaveBeenCalled();

    press("a", "Enter");
    expect(result.current.grabbedId).toBe("a");
    expect(result.current.announcement).toMatch(/^Grabbed A\./);

    press("a", "ArrowRight", { shift: true });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(result.current.announcement).toMatch(/^Resized A to 5 by 2/);

    const prevented = press("a", "Escape");
    expect(prevented).toHaveBeenCalled();
    expect(result.current.grabbedId).toBeNull();
    expect(result.current.announcement).toBe("Dropped A");
  });

  it("announces a blocked step with its direction", () => {
    const { result, onChange, press } = setup();
    press("a", "ArrowLeft", { alt: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.announcement).toBe("Can't move A left");
    press("a", "ArrowUp", { alt: true, shift: true });
    expect(result.current.announcement).toBe("Can't resize A further");
  });

  it("ends grab mode when the grip loses focus", () => {
    const { result, press } = setup();
    press("a", " ");
    expect(result.current.grabbedId).toBe("a");
    act(() => result.current.onGripBlur("a")());
    expect(result.current.grabbedId).toBeNull();
  });

  it("leaves unhandled keys alone (no preventDefault) so Tab and scrolling work", () => {
    const { press } = setup();
    expect(press("a", "Tab")).not.toHaveBeenCalled();
    expect(press("a", "ArrowDown")).not.toHaveBeenCalled();
  });
});
