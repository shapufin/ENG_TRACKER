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
  const reduceMotion = useReducedMotion();

  return (
    <GlassCard className="p-5">
      <CardHeader className="p-0 pb-4">
        <CardTitle className="text-base">Hours by Team Leader</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        <motion.div
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          variants={staggerContainer}
        >
          {sorted.map((leader, index) => {
            const body = (
              <>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-foreground font-semibold">{leader.name}</span>
                  <span className="text-foreground font-mono font-bold tabular-nums">
                    {leader.total_hours.toFixed(1)}h
                  </span>
                </div>
                <div className="bg-input-bg h-2.5 w-full overflow-hidden rounded-full">
                  <div
                    className={
                      index === 0
                        ? "bg-primary h-full rounded-full"
                        : "bg-primary/50 h-full rounded-full"
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
                      "hover:bg-muted focus-visible:ring-focus block w-full cursor-pointer rounded-lg p-1 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden",
                      selectedId === leader.id && "bg-primary/10"
                    )}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="p-1">{body}</div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </CardContent>
    </GlassCard>
  );
};
