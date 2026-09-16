import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter } from "lucide-react";
import { DateRangePicker } from "@/components/ui/DateRangePicker";

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

const statusLabels = {
  all: "All Status",
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
  <div className="relative">
    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <Input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-12 pl-11"
    />
  </div>
);

interface StatusFilterButtonProps {
  filterStatus: StatusFilter;
  onStatusChange: (val: StatusFilter) => void;
}

export const StatusFilterButton: React.FC<StatusFilterButtonProps> = ({
  filterStatus,
  onStatusChange,
}) => (
  <Button
    variant="outline"
    className="h-12 justify-start"
    onClick={() => {
      const statuses: StatusFilter[] = ["all", "pending", "approved", "rejected"];
      const currentIndex = statuses.indexOf(filterStatus);
      const nextIndex = (currentIndex + 1) % statuses.length;
      onStatusChange(statuses[nextIndex]);
    }}
  >
    <Filter className="mr-2 h-4 w-4" />
    {statusLabels[filterStatus]}
  </Button>
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
