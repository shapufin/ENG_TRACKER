import { useCallback, useState } from "react";
import { applyKeyboardAction, type GridItem, type KeyboardAction } from "./gridLayout";

const DIRECTIONS: Record<string, KeyboardAction["dir"]> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** What one key press on the grip means. */
export type GripIntent =
  | { type: "toggle-grab" }
  | { type: "drop" }
  | { type: "step"; dir: KeyboardAction["dir"]; resize: boolean };

interface GripKey {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Pure key map for the grip. Two paths reach the same steps: Alt+Arrow (Alt+Shift+Arrow
 * resizes), and "grab mode" (Enter/Space picks the widget up; plain arrows move it, Shift+arrows
 * resize it, Enter/Space/Escape drops it). Ctrl/Meta combos are never ours, and plain arrows
 * outside grab mode stay with the page so it keeps scrolling.
 */
export function gripIntent(e: GripKey, grabbed: boolean): GripIntent | null {
  if (e.ctrlKey || e.metaKey) return null;
  const dir = DIRECTIONS[e.key];
  if (dir && (e.altKey || grabbed)) return { type: "step", dir, resize: e.shiftKey };
  if (e.altKey) return null;
  if (e.key === "Enter" || e.key === " ") return { type: grabbed ? "drop" : "toggle-grab" };
  if (e.key === "Escape" && grabbed) return { type: "drop" };
  return null;
}

interface UseGridKeyboardOptions {
  /** Items of the breakpoint on screen. */
  items: readonly GridItem[];
  cols: number;
  titleOf: (id: string) => string;
  /** Receives the repacked items once per accepted key press. */
  onChange: (items: GridItem[]) => void;
}

/**
 * Keyboard path for the grip button (see `gripIntent`). The result goes through the same
 * `onChange` as a mouse gesture, and `announcement` feeds an `aria-live="polite"` region.
 */
export function useGridKeyboard({ items, cols, titleOf, onChange }: UseGridKeyboardOptions) {
  const [announcement, setAnnouncement] = useState("");
  const [grabbedId, setGrabbedId] = useState<string | null>(null);

  const drop = useCallback(
    (id: string) => {
      setGrabbedId(null);
      setAnnouncement(`Dropped ${titleOf(id)}`);
    },
    [titleOf]
  );

  const onGripKeyDown = useCallback(
    (id: string) => (e: React.KeyboardEvent) => {
      const grabbed = grabbedId === id;
      const intent = gripIntent(e, grabbed);
      if (!intent) return;
      e.preventDefault();
      if (intent.type === "toggle-grab") {
        setGrabbedId(id);
        setAnnouncement(
          `Grabbed ${titleOf(id)}. Arrow keys move it, Shift plus arrows resize it, Enter or Escape drops it.`
        );
        return;
      }
      if (intent.type === "drop") {
        drop(id);
        return;
      }
      const result = applyKeyboardAction(
        items,
        id,
        { dir: intent.dir, resize: intent.resize },
        cols,
        titleOf
      );
      if (!result) {
        setAnnouncement(
          intent.resize
            ? `Can't resize ${titleOf(id)} further`
            : `Can't move ${titleOf(id)} ${intent.dir}`
        );
        return;
      }
      setAnnouncement(result.announcement);
      onChange(result.items);
    },
    [grabbedId, items, cols, titleOf, onChange, drop]
  );

  /** Leaving the grip ends grab mode, so arrows never move a widget the user left behind. */
  const onGripBlur = useCallback(
    (id: string) => () => {
      if (grabbedId === id) setGrabbedId(null);
    },
    [grabbedId]
  );

  return { announcement, grabbedId, onGripKeyDown, onGripBlur };
}
