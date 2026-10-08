import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  OctagonAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";
import { useAdminOverview } from "@/hooks/useAdminDashboardQueries";
import { useAuth } from "@/hooks/useAuth";
import { fadeSlideUp, useMotionTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { deriveAdminInsights, type InsightSeverity } from "@/lib/adminInsights";
import { useDismissedInsights } from "../hooks/useDismissedInsights";

const SEVERITY: Record<InsightSeverity, { tone: Tone; label: string; Icon: LucideIcon }> = {
  critical: { tone: "danger", label: "Critical", Icon: OctagonAlert },
  warning: { tone: "warning", label: "Warning", Icon: AlertTriangle },
  info: { tone: "info", label: "Info", Icon: Info },
  positive: { tone: "success", label: "All clear", Icon: CheckCircle2 },
};

const pagerButton =
  "inline-flex min-h-6 min-w-6 items-center justify-center rounded-md hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Rule-based findings from the admin overview; one at a time, dismissible per user. */
export const AdminInsightsStrip: React.FC = () => {
  const { data, isLoading, isError, refetch } = useAdminOverview(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isDismissed, dismiss } = useDismissedInsights(user?.id);
  const [index, setIndex] = useState(0);
  const transition = useMotionTransition({ duration: 0.2 });

  const insights = useMemo(
    () => (data ? deriveAdminInsights(data).filter((i) => !isDismissed(i.signature)) : []),
    [data, isDismissed]
  );

  if (isError) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-xs" role="status">
        Insights unavailable.
        <Button variant="outline" size="control-sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (isLoading || insights.length === 0) return null;

  const current = insights[Math.min(index, insights.length - 1)];
  const { tone, label, Icon } = SEVERITY[current.severity];
  const step = (delta: number) => setIndex((i) => (i + delta + insights.length) % insights.length);

  return (
    <section aria-label="Automated insights">
      <motion.div
        key={current.signature}
        variants={fadeSlideUp}
        initial="hidden"
        animate="visible"
        transition={transition}
        className={cn(
          "flex min-h-10 items-center gap-3 rounded-lg border px-3 py-1",
          toneSurfaceClass[tone]
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-baseline md:gap-2">
          <p className="truncate text-sm font-semibold md:max-w-[55%] md:shrink-0">
            <span className="text-micro-lg font-mono tracking-wider uppercase">{label}</span>
            <span className="mx-2 opacity-60" aria-hidden>
              �
            </span>
            {current.title}
          </p>
          <p className="min-w-0 truncate text-xs opacity-90" title={current.message}>
            {current.message}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {insights.length > 1 && (
            <div className="text-micro-lg flex items-center gap-1 font-mono">
              <button
                type="button"
                className={pagerButton}
                onClick={() => step(-1)}
                aria-label="Previous insight"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="tabular-nums">
                {Math.min(index, insights.length - 1) + 1} of {insights.length}
              </span>
              <button
                type="button"
                className={pagerButton}
                onClick={() => step(1)}
                aria-label="Next insight"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {current.to && (
            <Button variant="outline" size="control-sm" onClick={() => navigate(current.to!)}>
              {current.actionLabel ?? "Open"}
            </Button>
          )}
          <button
            type="button"
            className={pagerButton}
            onClick={() => dismiss(current.signature)}
            aria-label="Dismiss insight"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </section>
  );
};
