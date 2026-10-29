const TEXT_TARGETS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * True when an arrow key belongs to something else: a form control, an editable
 * region, an open dialog/menu/listbox, or a handler that already consumed it.
 */
export function shouldIgnoreCalendarKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true;
  const target = e.target;
  if (target instanceof HTMLElement && (TEXT_TARGETS.has(target.tagName) || target.isContentEditable)) {
    return true;
  }
  return document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]') !== null;
}
