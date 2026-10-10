import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassCard } from "@/components/ui/GlassCard";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Calendar, Users, Filter } from "lucide-react";
import { ReportPeriodPresets } from "./ReportPeriodPresets";

interface ReportFilterPanelProps {
  start: string;
  end: string;
  selectedTeam: string;
  groupBy: "user" | "month" | "year";
  teams?: { id: number; name: string }[];
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onTeamChange: (v: string) => void;
  onGroupByChange: (v: "user" | "month" | "year") => void;
}

export const ReportFilterPanel: React.FC<ReportFilterPanelProps> = ({
  start,
  end,
  selectedTeam,
  groupBy,
  teams,
  onStartChange,
  onEndChange,
  onTeamChange,
  onGroupByChange,
}) => {
  return (
    <GlassCard className="space-y-4 p-6">
      <ReportPeriodPresets
        start={start}
        end={end}
        onSelect={(range) => {
          onStartChange(range.start);
          onEndChange(range.end);
        }}
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1 space-y-2">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
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

        <div className="min-w-[150px] space-y-2">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
            <Users className="h-3 w-3" /> Team
          </Label>
          <Select value={selectedTeam} onValueChange={onTeamChange}>
            <SelectTrigger className="bg-background/50 px-3">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[150px] space-y-2">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
            <Filter className="h-3 w-3" /> View Mode
          </Label>
          <Select
            value={groupBy}
            onValueChange={(v) => onGroupByChange(v as "user" | "month" | "year")}
          >
            <SelectTrigger className="bg-background/50 px-3">
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Per User</SelectItem>
              <SelectItem value="month">Monthly Trend</SelectItem>
              <SelectItem value="year">Yearly Summary</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </GlassCard>
  );
};
