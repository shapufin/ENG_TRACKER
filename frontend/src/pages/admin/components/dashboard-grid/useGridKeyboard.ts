import { useCallback, useState } from "react";
import { applyKeyboardAction, type GridItem, type KeyboardAction } from "./gridLayout";

const DIRECTIONS: Record<string, KeyboardAction["dir"]> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

interface UseGridKeyboardOptions {
  /** Items of the breakpoint on screen. */
  items: readonly GridItem[];
  cols: number;
  titleOf: (id: string) => string;
  /** Receives the repacked items once per accepted key press. */
  onChange: (items: GridItem[]) => void;
}

/**
 * Keyboard path for the grip button: Alt+Arrow moves a widget one cell, Alt+Shift+Arrow
 * resizes it one cell. The result goes through the same `onChange` as a mouse gesture, and
 * `announcement` feeds an `aria-live="polite"` region.
 */
export function useGridKeyboard({ items, cols, titleOf, onChange }: UseGridKeyboardOptions) {
  const [announcement, setAnnouncement] = useState("");

  const onGripKeyDown = useCallback(
    (id: string) => (e: React.KeyboardEvent) => {
      const dir = DIRECTIONS[e.key];
      if (!dir || !e.altKey) return;
      e.preventDefault();
      const result = applyKeyboardAction(items, id, { dir, resize: e.shiftKey }, cols, titleOf);
      if (!result) {
        setAnnouncement(`Can't ${e.shiftKey ? "resize" : "move"} ${titleOf(id)} further`);
        return;
      }
      setAnnouncement(result.announcement);
      onChange(result.items);
    },
    [items, cols, titleOf, onChange]
  );

  return { announcement, onGripKeyDown };
}
