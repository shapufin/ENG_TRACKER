import React from "react";
import { SearchInput, StatusChips, DateRangePickers, type StatusCounts } from "./filterBarParts";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  filterStatus: "all" | "pending" | "approved" | "rejected";
  onStatusChange: (val: "all" | "pending" | "approved" | "rejected") => void;
  dateFrom: string;
  onDateFromChange: (val: string) => void;
  dateTo: string;
  onDateToChange: (val: string) => void;
  statusCounts?: StatusCounts;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  filterStatus,
  onStatusChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  statusCounts,
}) => {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
        <SearchInput value={searchQuery} onChange={onSearchChange} />
        <DateRangePickers
          dateFrom={dateFrom}
          onDateFromChange={onDateFromChange}
          dateTo={dateTo}
          onDateToChange={onDateToChange}
        />
      </div>
      <StatusChips
        filterStatus={filterStatus}
        onStatusChange={onStatusChange}
        counts={statusCounts}
      />
    </div>
  );
};
