import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface LeaderItem {
  id: number;
  rank: number;
  name: string;
  team_name?: string | null;
  total_hours: number;
}

interface HRReportStatusCardProps {
  leaders: LeaderItem[];
  teams: { id: number; name: string }[];
}

export const HRReportStatusCard: React.FC<HRReportStatusCardProps> = ({ leaders, teams }) => {
  const teamNames = new Set(teams.map((t) => t.name));
  const coveredTeams = new Set(
    leaders.map((l) => l.team_name).filter((name): name is string => !!name && teamNames.has(name))
  ).size;
  const totalTeams = teams.length;
  const pct = totalTeams > 0 ? Math.round((coveredTeams / totalTeams) * 100) : 0;

  return (
    <GlassCard className="p-5">
      <CardHeader className="p-0 pb-3">
        <CardTitle className="text-base">Report Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-0">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Coverage</span>
          <span className="font-mono font-bold text-foreground">
            {coveredTeams} / {totalTeams} teams
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-input-bg">
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      </CardContent>
    </GlassCard>
  );
};
