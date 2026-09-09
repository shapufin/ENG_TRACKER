/**
 * DateRangeHistoryButton — date-range filter with popover.
 * Opens a popover with two DatePickers (from / to). When the user selects
 * a "From" date, the "To" date auto-populates to the last day of the same
 * month (user can still override). Replaces the old "Show History" toggle.
 */
import React, { useState, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/DatePicker";
import { Label } from "@/components/ui/label";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { useAutoMonthEnd } from "@/lib/useAutoMonthEnd";
import type { CustomDateRange } from "./useHoursLogPageState";

interface DateRangeHistoryButtonProps {
  customDateRange: CustomDateRange | null;
  onApply: (range: CustomDateRange | null) => void;
}

export const DateRangeHistoryButton: React.FC<DateRangeHistoryButtonProps> = ({
  customDateRange,
  onApply,
}) => {
  const [open, setOpen] = useState(false);
  const { from, to, setFrom, setTo } = useAutoMonthEnd(
    customDateRange?.from ?? "",
    customDateRange?.to ?? ""
  );

  // Sync internal draft state when the parent's customDateRange changes
  // externally (e.g. reset to null by another component).
  useEffect(() => {
    setFrom(customDateRange?.from ?? "");
    setTo(customDateRange?.to ?? "");
  }, [customDateRange?.from, customDateRange?.to, setFrom, setTo]);

  const handleApply = () => {
    if (from && to) {
      onApply({ from, to });
      setOpen(false);
    }
  };

  const handleReset = () => {
    onApply(null);
    setFrom("");
    setTo("");
    setOpen(false);
  };

  const hasCustomRange = !!customDateRange;
  const label = hasCustomRange
    ? `${formatDateDDMMYYYY(customDateRange!.from)} → ${formatDateDDMMYYYY(customDateRange!.to)}`
    : "Filter Date";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarIcon className="h-4 w-4" /> {label}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="end"
          className="z-50 w-80 rounded-lg border bg-popover p-4 shadow-md outline-none"
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>From Date</Label>
              <DatePicker value={from} onChange={setFrom} placeholder="DD/MM/YYYY" />
            </div>
            <div className="space-y-1">
              <Label>To Date</Label>
              <DatePicker value={to} onChange={setTo} placeholder="DD/MM/YYYY" />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                Current Month
              </Button>
              <Button size="sm" onClick={handleApply} disabled={!from || !to}>
                Apply
              </Button>
            </div>
          </div>
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
