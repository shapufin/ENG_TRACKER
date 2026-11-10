/**
 * Compute the next multi-select chip list:
 * - Plain click selects only `value` (or clears to `[]` if `value` was already the sole selection).
 * - Ctrl/Cmd+click toggles `value` inside `current`.
 */
export function toggleChipSelection<V>(current: readonly V[], value: V, multi: boolean): V[] {
  if (multi) {
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }
  if (current.length === 1 && current[0] === value) {
    return [];
  }
  return [value];
}

