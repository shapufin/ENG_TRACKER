import { useState, useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";

interface UseRangeSelectionOptions {
  onRangeSelected?: (dates: { start: string; end: string }) => void;
}

interface UseRangeSelectionReturn {
  rangeStart: Date | null;
  rangeEnd: Date | null;
  isDraggingRange: boolean;
  selectedDate: Date | null;
  selectedDates: { start: string; end: string } | null;
  handleRangeStart: (date: Date) => void;
  handleRangeMove: (date: Date) => void;
  finalizeRangeSelection: (date?: Date) => void;
  handleSelectDate: (date: Date) => void;
  applyRangeSelection: (start: Date, end: Date) => void;
}

export const useRangeSelection = (options?: UseRangeSelectionOptions): UseRangeSelectionReturn => {
  const onRangeSelected = options?.onRangeSelected;
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDates, setSelectedDates] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const dragAnchorRef = useRef<Date | null>(null);

  const applyRangeSelection = useCallback(
    (start: Date, end: Date, notify = true) => {
      const [first, second] = start <= end ? [start, end] : [end, start];
      setRangeStart(first);
      setRangeEnd(second);
      setSelectedDate(first);
      const dates = {
        start: format(first, "yyyy-MM-dd"),
        end: format(second, "yyyy-MM-dd"),
      };
      setSelectedDates(dates);
      if (notify) onRangeSelected?.(dates);
    },
    [onRangeSelected]
  );

  const handleSelectDate = useCallback(
    (date: Date) => {
      applyRangeSelection(date, date);
    },
    [applyRangeSelection]
  );

  const handleRangeStart = useCallback(
    (date: Date) => {
      dragAnchorRef.current = date;
      applyRangeSelection(date, date, false);
      setIsDraggingRange(true);
    },
    [applyRangeSelection]
  );

  const handleRangeMove = useCallback(
    (date: Date) => {
      if (!isDraggingRange || !dragAnchorRef.current) return;
      applyRangeSelection(dragAnchorRef.current, date, false);
    },
    [applyRangeSelection, isDraggingRange]
  );

  const finalizeRangeSelection = useCallback(
    (date?: Date) => {
      if (!isDraggingRange || !dragAnchorRef.current) return;
      applyRangeSelection(dragAnchorRef.current, date ?? dragAnchorRef.current);
      setIsDraggingRange(false);
      dragAnchorRef.current = null;
    },
    [applyRangeSelection, isDraggingRange]
  );

  useEffect(() => {
    const handleGlobalUp = () => {
      if (isDraggingRange) {
        finalizeRangeSelection();
      }
    };
    if (isDraggingRange) {
      window.addEventListener("mouseup", handleGlobalUp);
      window.addEventListener("touchend", handleGlobalUp);
      window.addEventListener("touchcancel", handleGlobalUp);
    }
    return () => {
      window.removeEventListener("mouseup", handleGlobalUp);
      window.removeEventListener("touchend", handleGlobalUp);
      window.removeEventListener("touchcancel", handleGlobalUp);
    };
  }, [finalizeRangeSelection, isDraggingRange]);

  return {
    rangeStart,
    rangeEnd,
    isDraggingRange,
    selectedDate,
    selectedDates,
    handleRangeStart,
    handleRangeMove,
    finalizeRangeSelection,
    handleSelectDate,
    applyRangeSelection,
  };
};
