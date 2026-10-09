import React from "react";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditLogFiltersProps {
  filterAction: string;
  onFilterActionChange: (value: string) => void;
  filterModel: string;
  onFilterModelChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
}

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
  { value: "APPROVE", label: "Approve" },
  { value: "REJECT", label: "Reject" },
];

const MODEL_OPTIONS = [
  { value: "all", label: "All Models" },
  { value: "overtimelog", label: "Overtime Log" },
  { value: "standbylog", label: "Standby Log" },
  { value: "vacationrequest", label: "Vacation Request" },
];

export const AuditLogFilters: React.FC<AuditLogFiltersProps> = ({
  filterAction,
  onFilterActionChange,
  filterModel,
  onFilterModelChange,
  searchQuery,
  onSearchQueryChange,
}) => (
  <FilterToolbar>
    <FilterToolbar.Search>
      <SearchField
        placeholder="Search by user or object..."
        aria-label="Search audit logs"
        value={searchQuery}
        onChange={onSearchQueryChange}
      />
    </FilterToolbar.Search>
    <Select value={filterAction} onValueChange={onFilterActionChange}>
      <SelectTrigger aria-label="Action" className="sm:w-40">
        <SelectValue placeholder="All Actions" />
      </SelectTrigger>
      <SelectContent>
        {ACTION_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Select value={filterModel} onValueChange={onFilterModelChange}>
      <SelectTrigger aria-label="Model" className="sm:w-44">
        <SelectValue placeholder="All Models" />
      </SelectTrigger>
      <SelectContent>
        {MODEL_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </FilterToolbar>
);
