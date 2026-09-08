import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter } from "lucide-react";

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
  <GlassCard>
    <div className="border-b border-border/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Filter className="h-4 w-4" /> Filters
      </h3>
    </div>
    <div className="grid gap-4 p-4 sm:grid-cols-3">
      <div>
        <Label htmlFor="audit-log-action" className="text-xs font-medium text-muted-foreground">
          Action
        </Label>
        <Select value={filterAction} onValueChange={onFilterActionChange}>
          <SelectTrigger id="audit-log-action" className="mt-1 w-full">
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
      </div>
      <div>
        <Label htmlFor="audit-log-model" className="text-xs font-medium text-muted-foreground">
          Model
        </Label>
        <Select value={filterModel} onValueChange={onFilterModelChange}>
          <SelectTrigger id="audit-log-model" className="mt-1 w-full">
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
      </div>
      <div>
        <Label htmlFor="audit-log-search" className="text-xs font-medium text-muted-foreground">
          Search
        </Label>
        <Input
          id="audit-log-search"
          type="text"
          placeholder="Search by user or object..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="mt-1 w-full"
        />
      </div>
    </div>
  </GlassCard>
);
