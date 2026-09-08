import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/GlassCard";
import { FilterMultiSelect, type FilterOption } from "./FilterMultiSelect";
import type { TeamOption, UserOption } from "./types";

interface AnalyticsFiltersProps {
  show: boolean;
  teams: TeamOption[] | undefined;
  users: UserOption[] | undefined;
  selectedTeams: string[];
  onTeamsChange: (ids: string[]) => void;
  selectedUsers: string[];
  onUsersChange: (ids: string[]) => void;
  selectedCategories: string[];
  onCategoryToggle: (category: string, checked: boolean) => void;
  selectedStatuses: string[];
  onStatusToggle: (status: string, checked: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}

const CATEGORIES = ["overtime", "standby", "leave"] as const;
const STATUSES = ["approved", "pending", "rejected"] as const;

export const AnalyticsFilters: React.FC<AnalyticsFiltersProps> = ({
  show,
  teams,
  users,
  selectedTeams,
  onTeamsChange,
  selectedUsers,
  onUsersChange,
  selectedCategories,
  onCategoryToggle,
  selectedStatuses,
  onStatusToggle,
  onClear,
  onClose,
}) => {
  if (!show) return null;

  const teamOptions: FilterOption[] = (teams ?? []).map((t) => ({
    id: t.name,
    label: t.name,
  }));

  const userOptions: FilterOption[] = (users ?? []).map((u) => ({
    id: u.id,
    label: u.full_name || u.username,
    sublabel: u.username,
  }));

  return (
    <GlassCard className="p-4 animate-in fade-in slide-in-from-top-2">
      <div className="flex flex-wrap items-end gap-4">
        {/* Teams Filter — Popover combobox */}
        <div className="min-w-[180px] flex-1 space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Teams
          </Label>
          <FilterMultiSelect
            options={teamOptions}
            value={selectedTeams}
            onChange={onTeamsChange}
            placeholder="All teams"
            compact
          />
        </div>

        {/* Users Filter — Popover combobox with search */}
        <div className="min-w-[180px] flex-1 space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Users
          </Label>
          <FilterMultiSelect
            options={userOptions}
            value={selectedUsers}
            onChange={onUsersChange}
            placeholder="All users"
            compact
          />
        </div>

        {/* Categories — compact toggle buttons */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Categories
          </Label>
          <div className="flex gap-1">
            {CATEGORIES.map((cat) => {
              const active = selectedCategories.includes(cat);
              return (
                <Button
                  key={cat}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-8 capitalize"
                  onClick={() => onCategoryToggle(cat, !active)}
                >
                  {cat}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Status — compact toggle buttons */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </Label>
          <div className="flex gap-1">
            {STATUSES.map((status) => {
              const active = selectedStatuses.includes(status);
              return (
                <Button
                  key={status}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-8 capitalize"
                  onClick={() => onStatusToggle(status, !active)}
                >
                  {status}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={onClear}>
            Clear All
          </Button>
          <Button variant="secondary" size="sm" className="h-8" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </GlassCard>
  );
};
