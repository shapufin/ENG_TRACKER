import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { DatePicker } from "@/components/ui/DatePicker";
import { useAutoMonthEndHandlers } from "@/lib/useAutoMonthEnd";

interface TLApprovalDateFiltersProps {
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
}

export const TLApprovalDateFilters: React.FC<TLApprovalDateFiltersProps> = ({
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}) => {
  const { handleFromChange, handleToChange } = useAutoMonthEndHandlers(
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange
  );

  return (
    <GlassCard delay={0.15} className="p-4">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[200px] flex-1">
          <DatePicker value={dateFrom} onChange={handleFromChange} placeholder="From date" />
        </div>
        <div className="min-w-[200px] flex-1">
          <DatePicker value={dateTo} onChange={handleToChange} placeholder="To date" />
        </div>
      </div>
    </GlassCard>
  );
};
