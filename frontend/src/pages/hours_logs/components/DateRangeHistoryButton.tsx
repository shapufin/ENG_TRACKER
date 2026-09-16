/**
 * DateRangeHistoryButton — date-range filter using the unified
 * DateRangePicker. Replaces the old "Show History" toggle.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import type { CustomDateRange } from "./useHoursLogPageState";

interface DateRangeHistoryButtonProps {
  customDateRange: CustomDateRange | null;
  onApply: (range: CustomDateRange | null) => void;
}

export const DateRangeHistoryButton: React.FC<DateRangeHistoryButtonProps> = ({
  customDateRange,
  onApply,
}) => {
  const handleChange = ({ from, to }: { from: string; to: string }) => {
    onApply(from && to ? { from, to } : null);
  };

  return (
    <div className="flex items-center gap-2">
      <DateRangePicker
        from={customDateRange?.from ?? ""}
        to={customDateRange?.to ?? ""}
        onChange={handleChange}
        placeholder="Filter Date"
        className="w-auto min-w-[220px]"
      />
      {customDateRange && (
        <Button variant="outline" size="sm" onClick={() => onApply(null)}>
          Current Month
        </Button>
      )}
    </div>
  );
};
