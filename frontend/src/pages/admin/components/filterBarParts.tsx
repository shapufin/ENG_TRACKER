import React from "react";
import { SearchField } from "@/components/ui/SearchField";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { DateRangePicker } from "@/components/ui/DateRangePicker";

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

const statusLabels = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = "Search by user...",
}) => (
  <SearchField
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    aria-label={placeholder}
  />
);

export interface StatusCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface StatusChipsProps {
  filterStatus: StatusFilter;
  onStatusChange: (val: StatusFilter) => void;
  /** Counts from the already-loaded list; chips show no count when omitted. */
  counts?: StatusCounts;
}

export const StatusChips: React.FC<StatusChipsProps> = ({
  filterStatus,
  onStatusChange,
  counts,
}) => (
  <FilterChipRow<StatusFilter>
    label="Status"
    selected={[filterStatus]}
    onToggle={onStatusChange}
    options={[
      { value: "all", label: statusLabels.all, count: counts?.total },
      { value: "pending", label: statusLabels.pending, count: counts?.pending },
      { value: "approved", label: statusLabels.approved, count: counts?.approved },
      { value: "rejected", label: statusLabels.rejected, count: counts?.rejected },
    ]}
  />
);

interface DateRangePickersProps {
  dateFrom: string;
  onDateFromChange: (val: string) => void;
  dateTo: string;
  onDateToChange: (val: string) => void;
}

export const DateRangePickers: React.FC<DateRangePickersProps> = ({
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}) => (
  <DateRangePicker
    from={dateFrom}
    to={dateTo}
    onChange={({ from, to }) => {
      onDateFromChange(from);
      onDateToChange(to);
    }}
    className="h-12"
    placeholder="Select date range"
  />
);
