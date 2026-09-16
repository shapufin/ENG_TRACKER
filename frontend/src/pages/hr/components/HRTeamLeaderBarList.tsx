import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { hoverLiftClass, staggerContainer, staggerItem } from "@/lib/motion";

interface LeaderItem {
  id: number;
  rank: number;
  name: string;
  team_name?: string | null;
  total_hours: number;
}

interface HRTeamLeaderBarListProps {
  leaders: LeaderItem[];
}

export const HRTeamLeaderBarList: React.FC<HRTeamLeaderBarListProps> = ({ leaders }) => {
  const sorted = [...leaders].sort((a, b) => b.total_hours - a.total_hours);
  const maxHours = sorted[0]?.total_hours || 1;
  const reduceMotion = useReducedMotion();

  return (
    <GlassCard className="p-5">
      <CardHeader className="p-0 pb-4">
        <CardTitle className="text-base">Overtime by Team Leader</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        <motion.div
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          variants={staggerContainer}
        >
          {sorted.map((leader, index) => (
            <motion.div
              key={leader.id}
              variants={staggerItem}
              className={`rounded-lg p-1 ${hoverLiftClass}`}
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">{leader.name}</span>
                <span className="font-mono font-bold tabular-nums text-foreground">
                  {leader.total_hours.toFixed(1)}h
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-input-bg">
                <div
                  className={
                    index === 0
                      ? "h-full rounded-full bg-primary"
                      : "h-full rounded-full bg-primary/50"
                  }
                  style={{
                    width: `${Math.min(100, Math.round((leader.total_hours / maxHours) * 100))}%`,
                  }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </CardContent>
    </GlassCard>
  );
};
