import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/GlassCard";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Calendar, Users, FileSpreadsheet } from "lucide-react";
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
  isLoading: boolean;
  onGenerate: () => void;
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
  isLoading,
  onGenerate,
}) => {
  return (
    <GlassCard isHoverLift={false} className="p-4">
      <div className="grid items-end gap-3 md:grid-cols-2 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-3">
          <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-3 w-3" /> Date Range
          </Label>
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
        <div className="lg:col-span-2">
          <FilterSelect
            label="Italian TL"
            icon={<Users className="h-3 w-3" />}
            value={selectedItalianTL}
            onChange={onItalianTLChange}
            placeholder="All Italian TLs"
            allLabel="All Italian TLs"
            noneLabel="None (No Filter)"
            options={italianTLs}
            renderOption={(tl) => `${tl.full_name} (${tl.member_count})`}
          />
        </div>
        <div className="lg:col-span-2">
          <FilterSelect
            label="Albanian TL"
            icon={<Users className="h-3 w-3" />}
            value={selectedAlbanianTL}
            onChange={onAlbanianTLChange}
            placeholder="All Albanian TLs"
            allLabel="All Albanian TLs"
            noneLabel="None (No Filter)"
            options={albanianTLs}
            renderOption={(tl) => `${tl.full_name} (${tl.member_count})`}
          />
        </div>
        <div className="lg:col-span-2">
          <FilterSelect
            label="Team"
            icon={<Users className="h-3 w-3" />}
            value={selectedTeam}
            onChange={onTeamChange}
            placeholder="All Teams"
            allLabel="All Teams"
            options={teams}
            renderOption={(team) => `${team.name} (${team.code}) - ${team.members_count} members`}
          />
        </div>
        <div className="lg:col-span-2">
          <FilterSelect
            label="Workspace"
            icon={<Calendar className="h-3 w-3" />}
            value={selectedWorkspace}
            onChange={onWorkspaceChange}
            placeholder="All Workspaces"
            allLabel="All Workspaces"
            options={workspaces}
            renderOption={(ws) => `${ws.name} - ${ws.user_count} users`}
          />
        </div>
        <div className="lg:col-span-1">
          <Button
            className="w-full whitespace-nowrap px-2 shadow-lg shadow-primary/20"
            onClick={onGenerate}
            disabled={isLoading}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Generate
          </Button>
        </div>
      </div>
    </GlassCard>
  );
};
