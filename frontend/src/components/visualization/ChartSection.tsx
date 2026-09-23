import React from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ChartSectionProps {
  /** Stable id — used as the PDF capture anchor, must be unique per page. */
  id: string;
  /** Omit for a section that renders its own custom header (e.g. a hero stat). */
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Capture anchor + card chrome for one chart in a visualization gallery.
 * `data-chart-section` is what `pdfExport.captureChartsToPdf` queries for.
 * The entrance animation lives on THIS wrapper (via the parent's
 * `staggerContainer`), so `GlassCard`'s own mount fade is turned off —
 * otherwise the two independent animations stack into a double-fade. */
export const ChartSection: React.FC<ChartSectionProps> = ({
  id,
  title,
  description,
  action,
  children,
  className,
}) => (
  <motion.div id={id} data-chart-section={id} variants={staggerItem} className={className}>
    <GlassCard
      animateOnMount={false}
      isHoverLift={false}
      className={cn("relative overflow-hidden p-5")}
    >
      {(title || description || action) && (
        <div className="flex items-center justify-between gap-3">
          <div>
            {title && (
              <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={title || description || action ? "mt-4" : undefined}>{children}</div>
    </GlassCard>
  </motion.div>
);
