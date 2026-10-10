import React from "react";
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
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export type Severity = "critical" | "warning" | "info" | "positive";

// eslint-disable-next-line react-refresh/only-export-components -- shared with AdminInsightsStrip per plan
export const SEVERITY_META: Record<Severity, { tone: Tone; label: string; Icon: LucideIcon }> = {
  critical: { tone: "danger", label: "Critical", Icon: OctagonAlert },
  warning: { tone: "warning", label: "Warning", Icon: AlertTriangle },
  info: { tone: "info", label: "Info", Icon: Info },
  positive: { tone: "success", label: "All clear", Icon: CheckCircle2 },
};

const ORDER: Severity[] = ["critical", "warning", "info", "positive"];

const iconButton =
  "inline-flex min-h-6 min-w-6 items-center justify-center rounded-md hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export interface SeverityBannerProps {
  severity: Severity;
  title: string;
  message?: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  pager?: { index: number; total: number; onPrev: () => void; onNext: () => void };
  /** Counts of the whole queue by severity, shown as "2 critical \u00b7 1 warning" when total > 1. */
  counts?: Partial<Record<Severity, number>>;
}

export const SeverityBanner: React.FC<SeverityBannerProps> = ({
  severity,
  title,
  message,
  action,
  onDismiss,
  pager,
  counts,
}: SeverityBannerProps) => {
  const { tone, label, Icon } = SEVERITY_META[severity];
  const stacked = !!pager && pager.total > 1;
  const countText = counts
    ? ORDER.filter((s) => (counts[s] ?? 0) > 0)
        .map((s) => `${counts[s]} ${s}`)
        .join(" \u00b7 ")
    : "";

  return (
    <div className={cn("relative", stacked && "mb-3")}>
      {stacked && (
        <>
          <div
            aria-hidden
            data-testid="severity-deck-layer"
            className="bg-card absolute inset-x-2 -bottom-1.5 h-full rounded-lg border opacity-70"
          />
          <div
            aria-hidden
            data-testid="severity-deck-layer"
            className="bg-card absolute inset-x-4 -bottom-3 h-full rounded-lg border opacity-40"
          />
        </>
      )}
      <div
        data-testid="severity-banner"
        className={cn(
          "relative flex min-h-10 items-center gap-3 rounded-lg border px-3 py-1",
          toneSurfaceClass[tone]
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-baseline md:gap-2">
          <p className="truncate text-sm font-semibold md:max-w-[55%] md:shrink-0">
            <span className="text-xs font-mono tracking-wider uppercase">{label}</span>
            <span className="mx-2 opacity-60" aria-hidden>
              {"\u00b7"}
            </span>
            {title}
          </p>
          {message && (
            <p className="min-w-0 truncate text-xs opacity-90" title={message}>
              {message}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {stacked && pager && (
            <div className="text-xs flex items-center gap-1 font-mono">
              {countText && <span className="mr-1 hidden opacity-80 md:inline">{countText}</span>}
              <button
                type="button"
                className={iconButton}
                onClick={pager.onPrev}
                aria-label="Previous insight"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="tabular-nums">
                {pager.index + 1} of {pager.total}
              </span>
              <button
                type="button"
                className={iconButton}
                onClick={pager.onNext}
                aria-label="Next insight"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {action}
          {onDismiss && (
            <button
              type="button"
              className={iconButton}
              onClick={onDismiss}
              aria-label="Dismiss insight"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
