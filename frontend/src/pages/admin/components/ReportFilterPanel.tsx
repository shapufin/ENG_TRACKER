import React from "react";
import { Button } from "@/components/ui/button";
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
import { Calendar, Users, Filter, FileBarChart } from "lucide-react";

interface ReportFilterPanelProps {
  start: string;
  end: string;
  selectedTeam: string;
  groupBy: "user" | "month" | "year";
  teams?: { id: number; name: string }[];
  isLoading: boolean;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onTeamChange: (v: string) => void;
  onGroupByChange: (v: "user" | "month" | "year") => void;
  onGenerate: () => void;
}

export const ReportFilterPanel: React.FC<ReportFilterPanelProps> = ({
  start,
  end,
  selectedTeam,
  groupBy,
  teams,
  isLoading,
  onStartChange,
  onEndChange,
  onTeamChange,
  onGroupByChange,
  onGenerate,
}) => {
  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <Calendar className="h-3.5 w-3.5" /> Date Range
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

        <div className="min-w-[150px] space-y-1.5">
          <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <Users className="h-3.5 w-3.5" /> Team
          </Label>
          <Select value={selectedTeam} onValueChange={onTeamChange}>
            <SelectTrigger>
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

        <div className="min-w-[150px] space-y-1.5">
          <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <Filter className="h-3.5 w-3.5" /> View Mode
          </Label>
          <Select
            value={groupBy}
            onValueChange={(v) => onGroupByChange(v as "user" | "month" | "year")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Per User</SelectItem>
              <SelectItem value="month">Monthly Trend</SelectItem>
              <SelectItem value="year">Yearly Summary</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button size="control" onClick={onGenerate} disabled={isLoading}>
          <FileBarChart className="mr-2 h-4 w-4" />
          Generate Intelligence
        </Button>
      </div>
    </GlassCard>
  );
};
