import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface LeaderItem {
  id: number;
  rank: number;
  name: string;
  team_name?: string | null;
  total_hours: number;
}

interface HRTeamLeaderBarListProps {
  leaders: LeaderItem[];
  /** When given, each bar becomes a button that filters the report to that leader. */
  onSelect?: (leaderId: number) => void;
  selectedId?: number | null;
}

export const HRTeamLeaderBarList: React.FC<HRTeamLeaderBarListProps> = ({
  leaders,
  onSelect,
  selectedId,
}) => {
  const sorted = [...leaders].sort((a, b) => b.total_hours - a.total_hours);
  const maxHours = sorted[0]?.total_hours || 1;
  const grandTotal = sorted.reduce((sum, l) => sum + l.total_hours, 0);
  const reduceMotion = useReducedMotion();

  return (
    <GlassCard className="flex h-full flex-col p-5">
      <CardHeader className="flex flex-row items-start justify-between gap-2 p-0 pb-4">
        <div>
          <CardTitle className="text-base">Hours by Team Leader</CardTitle>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Ranked standby &amp; overtime share · click a leader to filter
          </p>
        </div>
        <span className="text-foreground font-mono text-sm font-bold tabular-nums">
          {grandTotal.toFixed(1)}h
        </span>
      </CardHeader>
      <CardContent className="flex-1 space-y-2.5 p-0">
        <motion.div
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          variants={staggerContainer}
          className="space-y-2"
        >
          {sorted.map((leader, index) => {
            const pct = grandTotal > 0 ? Math.round((leader.total_hours / grandTotal) * 100) : 0;
            const body = (
              <>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-foreground flex items-center gap-2 font-semibold">
                    <span className="text-muted-foreground font-mono font-normal">
                      #{leader.rank ?? index + 1}
                    </span>
                    <span>{leader.name}</span>
                  </span>
                  <span className="text-foreground font-mono font-bold tabular-nums">
                    {leader.total_hours.toFixed(1)}h
                    {grandTotal > 0 && (
                      <span className="text-muted-foreground ml-2 font-normal">{pct}%</span>
                    )}
                  </span>
                </div>
                <div className="bg-surface-sunken h-2 w-full overflow-hidden rounded-full">
                  <div
                    className={
                      index === 0
                        ? "bg-primary h-full rounded-full"
                        : "bg-primary/55 h-full rounded-full"
                    }
                    style={{
                      width: `${Math.min(100, Math.round((leader.total_hours / maxHours) * 100))}%`,
                    }}
                  />
                </div>
              </>
            );
            return (
              <motion.div key={leader.id} variants={staggerItem} className="rounded-lg">
                {onSelect ? (
                  <button
                    type="button"
                    aria-pressed={selectedId === leader.id}
                    onClick={() => onSelect(leader.id)}
                    className={cn(
                      "hover:bg-muted/60 focus-visible:ring-focus block w-full cursor-pointer rounded-lg p-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden",
                      selectedId === leader.id && "bg-primary/10"
                    )}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="p-1.5">{body}</div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </CardContent>
    </GlassCard>
  );
};
