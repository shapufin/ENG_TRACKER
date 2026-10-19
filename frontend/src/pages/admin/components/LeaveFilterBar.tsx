import React from "react";
import { Button } from "@/components/ui/button";
import { Filter, Sun } from "lucide-react";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchInput, DateRangePickers } from "./filterBarParts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { User as UserType } from "@/types";

interface LeaveToolbarFiltersProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  filterType: "all" | "vacation";
  onTypeChange: (val: "all" | "vacation") => void;
  filterUser: string;
  onUserChange: (val: string) => void;
  users?: UserType[];
  dateFrom: string;
  onDateFromChange: (val: string) => void;
  dateTo: string;
  onDateToChange: (val: string) => void;
}

const typeLabels = {
  all: "All Types",
  vacation: "Vacation",
};

/** Search, type, user and date range: the controls that share the table toolbar row with Columns. */
export const LeaveToolbarFilters: React.FC<LeaveToolbarFiltersProps> = ({
  searchQuery,
  onSearchChange,
  filterType,
  onTypeChange,
  filterUser,
  onUserChange,
  users,
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
      <Button
        variant="outline"
        size="control"
        onClick={() => {
          const types: Array<"all" | "vacation"> = ["all", "vacation"];
          const currentIndex = types.indexOf(filterType);
          const nextIndex = (currentIndex + 1) % types.length;
          onTypeChange(types[nextIndex]);
        }}
      >
        {filterType === "vacation" ? (
          <Sun className="mr-2 h-4 w-4" />
        ) : (
          <Filter className="mr-2 h-4 w-4" />
        )}
        {typeLabels[filterType]}
      </Button>
      <Select value={filterUser} onValueChange={onUserChange}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="All Users" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Users</SelectItem>
          {users?.map((u: UserType) => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.first_name} {u.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="w-full sm:w-64">
        <DateRangePickers
          dateFrom={dateFrom}
          onDateFromChange={onDateFromChange}
          dateTo={dateTo}
          onDateToChange={onDateToChange}
        />
      </div>
    </>
  );
};
