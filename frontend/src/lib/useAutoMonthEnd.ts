/**
 * useAutoMonthEnd — when the user selects a "From" date in a date-range
 * filter, auto-populate the "To" date with the last day of the same month.
 * The user can still override the "To" date manually after auto-population.
 *
 * Two modes:
 * 1. Internal state (useAutoMonthEnd) — for components that own their state
 * 2. Controlled wrapper (useAutoMonthEndHandlers) — for controlled components
 *    where the parent owns the from/to state
 */
import { useState, useCallback } from "react";
import { getMonthEndISO } from "./date-format-utils";

export function useAutoMonthEnd(initialFrom: string = "", initialTo: string = "") {
  const [from, setFromState] = useState(initialFrom);
  const [to, setToState] = useState(initialTo);

  const setFrom = useCallback((newFrom: string) => {
    setFromState(newFrom);
    if (newFrom) {
      const monthEnd = getMonthEndISO(newFrom);
      setToState((prevTo) => {
        if (!prevTo || prevTo < newFrom) return monthEnd ?? prevTo;
        return prevTo;
      });
    }
  }, []);

  const setTo = useCallback((newTo: string) => {
    setToState(newTo);
  }, []);

  return { from, to, setFrom, setTo };
}

/**
 * Controlled wrapper — wraps parent-provided from/to change handlers so
 * that selecting a "From" date auto-populates "To" with the month's last day.
 *
 * Usage:
 *   const { handleFromChange, handleToChange } = useAutoMonthEndHandlers(
 *     start, end, onStartChange, onEndChange,
 *   );
 *   <DatePicker value={start} onChange={handleFromChange} />
 *   <DatePicker value={end} onChange={handleToChange} />
 */
export function useAutoMonthEndHandlers(
  from: string,
  to: string,
  onFromChange: (v: string) => void,
  onToChange: (v: string) => void
) {
  const handleFromChange = useCallback(
    (newFrom: string) => {
      onFromChange(newFrom);
      if (newFrom) {
        const monthEnd = getMonthEndISO(newFrom);
        if (monthEnd && (!to || to < newFrom)) {
          onToChange(monthEnd);
        }
      }
    },
    [to, onFromChange, onToChange]
  );

  return { handleFromChange, handleToChange: onToChange };
}
