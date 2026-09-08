import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatDateTime } from "@/lib/date-format-utils";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  status: "approved" | "pending" | "rejected" | "cancelled";
}

const statusConfig = {
  approved: { icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10" },
  pending: { icon: Clock, color: "text-amber-500 bg-amber-500/10" },
  rejected: { icon: XCircle, color: "text-rose-500 bg-rose-500/10" },
  cancelled: { icon: AlertCircle, color: "text-muted-foreground bg-muted" },
};

interface ActivityTimelineProps {
  items: ActivityItem[];
  delay?: number;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ items, delay = 0 }) => {
  return (
    <GlassCard delay={delay} className="flex flex-col overflow-hidden">
      <div className="border-b border-border/60 p-4">
        <h3 className="text-sm font-semibold">Recent Activity</h3>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="relative space-y-4 pl-2">
          <div className="absolute bottom-2 left-[19px] top-2 w-px bg-border/60" />
          {items.map((item, i) => {
            const { icon: Icon, color } = statusConfig[item.status];
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: delay + i * 0.06, duration: 0.3 }}
                className="relative flex items-start gap-3"
              >
                <div
                  className={cn(
                    "z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-background",
                    color
                  )}
                >
                  <Icon className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">
                    <span className="font-medium">{item.user}</span>{" "}
                    <span className="text-muted-foreground">{item.action}</span>{" "}
                    <span className="font-medium">{item.target}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                    {formatDateTime(item.timestamp) || item.timestamp}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
};
