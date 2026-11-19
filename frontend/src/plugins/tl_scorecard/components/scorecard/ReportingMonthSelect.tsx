import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currentBusinessMonthKey, currentBusinessYear } from "@/lib/date-format-utils";

interface ReportingMonthSelectProps {
  year: number;
  month: string; // ISO format "YYYY-MM-01" or "YYYY-MM"
  onMonthChange: (month: string) => void;
}

const MONTH_LABELS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

/** Selects which calendar month the scorecard displays and exports. */
export const ReportingMonthSelect: React.FC<ReportingMonthSelectProps> = ({
  year,
  month,
  onMonthChange,
}) => {
  const currentYear = currentBusinessYear();
  const currentMonthKey = currentBusinessMonthKey();
  const currentMonthIndex = Number(currentMonthKey.slice(5, 7));

  const selectedMonthCode = month.slice(5, 7) || "01";

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Label htmlFor="scorecard-reporting-month" className="text-xs sr-only sm:not-sr-only">
        Month
      </Label>
      <Select
        value={selectedMonthCode}
        onValueChange={(val) => onMonthChange(`${year}-${val}-01`)}
      >
        <SelectTrigger
          id="scorecard-reporting-month"
          className="w-32 sm:w-36"
          controlSize="sm"
          aria-label="Select month"
        >
          <SelectValue placeholder="Select month" />
        </SelectTrigger>
        <SelectContent>
          {MONTH_LABELS.map(({ value, label }) => {
            const isFuture = year === currentYear && Number(value) > currentMonthIndex;
            return (
              <SelectItem
                key={value}
                value={value}
                disabled={isFuture}
              >
                {label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};
