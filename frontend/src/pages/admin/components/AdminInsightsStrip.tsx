import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SeverityBanner, type Severity } from "@/components/ui/SeverityBanner";
import { useAdminOverview } from "@/hooks/useAdminDashboardQueries";
import { useAuth } from "@/hooks/useAuth";
import { fadeSlideUp, useMotionTransition } from "@/lib/motion";
import { deriveAdminInsights } from "@/lib/adminInsights";
import { useDismissedInsights } from "../hooks/useDismissedInsights";

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
  const counts: Partial<Record<Severity, number>> = {};
  for (const i of insights) counts[i.severity] = (counts[i.severity] ?? 0) + 1;
  const step = (delta: number) => setIndex((i) => (i + delta + insights.length) % insights.length);

  return (
    <section aria-label="Automated insights">
      <motion.div
        key={current.signature}
        variants={fadeSlideUp}
        initial="hidden"
        animate="visible"
        transition={transition}
      >
        <SeverityBanner
          severity={current.severity}
          title={current.title}
          message={current.message}
          counts={counts}
          pager={{
            index: Math.min(index, insights.length - 1),
            total: insights.length,
            onPrev: () => step(-1),
            onNext: () => step(1),
          }}
          action={
            current.to ? (
              <Button variant="outline" size="control-sm" onClick={() => navigate(current.to!)}>
                {current.actionLabel ?? "Open"}
              </Button>
            ) : undefined
          }
          onDismiss={() => dismiss(current.signature)}
        />
      </motion.div>
    </section>
  );
};
