import React from "react";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/GlassCard";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/ActiveFilterChips";
import { FilterSelect } from "./FilterSelect";
import type { TeamLeaderOption } from "@/hooks/useHRReportManagement";

interface HRReportFiltersProps {
  start: string;
  onStartChange: (v: string) => void;
  end: string;
  onEndChange: (v: string) => void;
  selectedItalianTL: string;
  onItalianTLChange: (v: string) => void;
  selectedAlbanianTL: string;
  onAlbanianTLChange: (v: string) => void;
  selectedTeam: string;
  onTeamChange: (v: string) => void;
  selectedWorkspace: string;
  onWorkspaceChange: (v: string) => void;
  italianTLs?: TeamLeaderOption[];
  albanianTLs?: TeamLeaderOption[];
  teams?: { id: number; name: string; code: string; members_count: number }[];
  workspaces?: { id: number; name: string; user_count: number }[];
  /** Puts Manager, Line Manager, Team and Workspace back to All (dates stay). */
  onResetFilters: () => void;
}

export const HRReportFilters: React.FC<HRReportFiltersProps> = ({
  start,
  onStartChange,
  end,
  onEndChange,
  selectedItalianTL,
  onItalianTLChange,
  selectedAlbanianTL,
  onAlbanianTLChange,
  selectedTeam,
  onTeamChange,
  selectedWorkspace,
  onWorkspaceChange,
  italianTLs,
  albanianTLs,
  teams,
  workspaces,
  onResetFilters,
}) => {
  const nameOf = (value: string, noneName: string, find: () => string | undefined) =>
    value === "none" ? noneName : (find() ?? value);
  const chips: ActiveFilterChip[] = [
    {
      id: "italian",
      label: "Manager",
      value: nameOf(
        selectedItalianTL,
        "None",
        () => italianTLs?.find((t) => String(t.id) === selectedItalianTL)?.full_name
      ),
      active: selectedItalianTL !== "all",
      onRemove: () => onItalianTLChange("all"),
    },
    {
      id: "albanian",
      label: "Line Manager",
      value: nameOf(
        selectedAlbanianTL,
        "None",
        () => albanianTLs?.find((t) => String(t.id) === selectedAlbanianTL)?.full_name
      ),
      active: selectedAlbanianTL !== "all",
      onRemove: () => onAlbanianTLChange("all"),
    },
    {
      id: "team",
      label: "Team",
      value: teams?.find((t) => String(t.id) === selectedTeam)?.name ?? selectedTeam,
      active: selectedTeam !== "all",
      onRemove: () => onTeamChange("all"),
    },
    {
      id: "workspace",
      label: "Workspace",
      value: workspaces?.find((w) => String(w.id) === selectedWorkspace)?.name ?? selectedWorkspace,
      active: selectedWorkspace !== "all",
      onRemove: () => onWorkspaceChange("all"),
    },
  ].filter((chip) => chip.active);

  return (
    <GlassCard className="space-y-3 p-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(225px,1.25fr)_repeat(4,minmax(0,1fr))]">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-medium">Date range</Label>
          <DateRangePicker
            from={start}
            to={end}
            onChange={({ from, to }) => {
              onStartChange(from);
              onEndChange(to);
            }}
            placeholder="Select date range"
          />
        </div>
        <FilterSelect
          label="Manager"
          value={selectedItalianTL}
          onChange={onItalianTLChange}
          placeholder="All Managers"
          allLabel="All Managers"
          noneLabel="None (No Filter)"
          options={italianTLs}
          renderOption={(tl) => `${tl.full_name} (${tl.member_count})`}
        />
        <FilterSelect
          label="Line Manager"
          value={selectedAlbanianTL}
          onChange={onAlbanianTLChange}
          placeholder="All Line Managers"
          allLabel="All Line Managers"
          noneLabel="None (No Filter)"
          options={albanianTLs}
          renderOption={(tl) => `${tl.full_name} (${tl.member_count})`}
        />
        <FilterSelect
          label="Team"
          value={selectedTeam}
          onChange={onTeamChange}
          placeholder="All Teams"
          allLabel="All Teams"
          options={teams}
          renderOption={(team) => `${team.name} (${team.code}) - ${team.members_count} members`}
        />
        <FilterSelect
          label="Workspace"
          value={selectedWorkspace}
          onChange={onWorkspaceChange}
          placeholder="All Workspaces"
          allLabel="All Workspaces"
          options={workspaces}
          renderOption={(ws) => `${ws.name} - ${ws.user_count} users`}
        />
      </div>
      <ActiveFilterChips chips={chips} onReset={onResetFilters} />
    </GlassCard>
  );
};
