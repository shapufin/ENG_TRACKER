import React from "react";
import { SearchInput, StatusFilterButton, DateRangePickers } from "./filterBarParts";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  filterStatus: "all" | "pending" | "approved" | "rejected";
  onStatusChange: (val: "all" | "pending" | "approved" | "rejected") => void;
  dateFrom: string;
  onDateFromChange: (val: string) => void;
  dateTo: string;
  onDateToChange: (val: string) => void;
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
}) => {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_220px_180px_180px]">
      <SearchInput value={searchQuery} onChange={onSearchChange} />
      <StatusFilterButton filterStatus={filterStatus} onStatusChange={onStatusChange} />
      <DateRangePickers
        dateFrom={dateFrom}
        onDateFromChange={onDateFromChange}
        dateTo={dateTo}
        onDateToChange={onDateToChange}
      />
    </div>
  );
};
