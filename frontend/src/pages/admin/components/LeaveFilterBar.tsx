import React from "react";
import { Button } from "@/components/ui/button";
import { Filter, Sun } from "lucide-react";
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
    <div className="grid gap-4 xl:grid-cols-[1fr_160px_160px_180px_180px_180px]">
      <SearchInput value={searchQuery} onChange={onSearchChange} />
      <StatusFilterButton filterStatus={filterStatus} onStatusChange={onStatusChange} />
      <Button
        variant="outline"
        className="h-12 justify-start"
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
        <SelectTrigger className="h-12">
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
    </div>
  );
};
