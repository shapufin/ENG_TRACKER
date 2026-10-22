import React from "react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
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

const typeOptions = [
  { value: "all", label: "All Types", icon: Filter },
  { value: "vacation", label: "Vacation", icon: Sun },
] as const;

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
      <FilterChipRow<"all" | "vacation">
        label="Type"
        options={[...typeOptions]}
        selected={[filterType]}
        onToggle={onTypeChange}
      />
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
