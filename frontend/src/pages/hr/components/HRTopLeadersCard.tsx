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

interface HRTopLeadersCardProps {
  leaders: LeaderItem[];
}

const RANK_STYLES: Record<number, string> = {
  1: "bg-warning/15 text-foreground",
  2: "bg-muted text-foreground",
  3: "bg-accent-orange/15 text-foreground",
};

const rankClass = (rank: number) => RANK_STYLES[rank] ?? "bg-muted text-muted-foreground";

export const HRTopLeadersCard: React.FC<HRTopLeadersCardProps> = ({ leaders }) => (
  <GlassCard className="p-6">
    <CardHeader className="pb-4">
      <CardTitle className="text-base">Top Team Leaders</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {leaders.slice(0, 5).map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${rankClass(l.rank)}`}
              >
                #{l.rank}
              </div>
              <div>
                <p className="font-semibold">{l.name}</p>
                <p className="text-xs text-muted-foreground">{l.team_name || "No Team"}</p>
              </div>
            </div>
            <p className="font-mono font-bold tabular-nums text-foreground">
              {l.total_hours.toFixed(1)}h
            </p>
          </div>
        ))}
      </div>
    </CardContent>
  </GlassCard>
);
