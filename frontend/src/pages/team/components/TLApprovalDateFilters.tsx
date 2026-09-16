import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { DateRangePicker } from "@/components/ui/DateRangePicker";

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
  return (
    <GlassCard delay={0.15} className="p-4">
      <DateRangePicker
        from={dateFrom}
        to={dateTo}
        onChange={({ from, to }) => {
          onDateFromChange(from);
          onDateToChange(to);
        }}
        placeholder="Filter by date"
      />
    </GlassCard>
  );
};
