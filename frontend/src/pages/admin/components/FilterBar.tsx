import React from "react";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
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
    <>
      <FilterToolbar.Search>
        <SearchInput value={searchQuery} onChange={onSearchChange} />
      </FilterToolbar.Search>
      <StatusFilterButton filterStatus={filterStatus} onStatusChange={onStatusChange} />
      <DateRangePickers
        dateFrom={dateFrom}
        onDateFromChange={onDateFromChange}
        dateTo={dateTo}
        onDateToChange={onDateToChange}
      />
    </>
  );
};
