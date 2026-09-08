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
import { DatePicker } from "@/components/ui/DatePicker";
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
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1 space-y-2">
          <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-3 w-3" /> Date Range
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker value={start} onChange={onStartChange} placeholder="DD/MM/YYYY" />
            <span className="text-muted-foreground">to</span>
            <DatePicker value={end} onChange={onEndChange} placeholder="DD/MM/YYYY" />
          </div>
        </div>

        <div className="min-w-[150px] space-y-2">
          <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3 w-3" /> Team
          </Label>
          <Select value={selectedTeam} onValueChange={onTeamChange}>
            <SelectTrigger className="h-10 bg-background/50 px-3">
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
          <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3 w-3" /> View Mode
          </Label>
          <Select
            value={groupBy}
            onValueChange={(v) => onGroupByChange(v as "user" | "month" | "year")}
          >
            <SelectTrigger className="h-10 bg-background/50 px-3">
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Per User</SelectItem>
              <SelectItem value="month">Monthly Trend</SelectItem>
              <SelectItem value="year">Yearly Summary</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          className="px-8 shadow-lg shadow-primary/20"
          onClick={onGenerate}
          disabled={isLoading}
        >
          <FileBarChart className="mr-2 h-4 w-4" />
          Generate Intelligence
        </Button>
      </div>
    </GlassCard>
  );
};
