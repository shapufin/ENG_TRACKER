import React from "react";
import { Button } from "@/components/ui/button";
import { Filter, Sun } from "lucide-react";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchInput, StatusFilterButton, DateRangePickers } from "./filterBarParts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { User as UserType } from "@/types";

interface LeaveFilterBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  filterStatus: "all" | "pending" | "approved" | "rejected";
  onStatusChange: (val: "all" | "pending" | "approved" | "rejected") => void;
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

export const LeaveFilterBar: React.FC<LeaveFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  filterStatus,
  onStatusChange,
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
      <FilterToolbar.Search className="sm:max-w-56">
        <SearchInput value={searchQuery} onChange={onSearchChange} />
      </FilterToolbar.Search>
      <StatusFilterButton filterStatus={filterStatus} onStatusChange={onStatusChange} />
      <Button
        variant="outline"
        size="control"
        className="min-w-32 justify-start"
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
        <SelectTrigger aria-label="Filter by user" className="sm:w-44">
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
      <DateRangePickers
        dateFrom={dateFrom}
        onDateFromChange={onDateFromChange}
        dateTo={dateTo}
        onDateToChange={onDateToChange}
      />
    </>
  );
};
