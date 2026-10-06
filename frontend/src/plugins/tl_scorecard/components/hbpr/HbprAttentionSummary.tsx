import React from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  FileClock,
  FilePlus2,
  History,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { toneSurfaceClass, toneTextClass, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import type { HbprNeedsAttention } from "../../types/tlScorecard";
import { plural } from "./hbprMeta";

interface Card {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  count: number;
  title: string;
  action: string;
  to: string;
}

/**
 * The HBPR's attention surface: cadence and EPR governance evidence only.
 * Employee one-on-ones and HR approval/decision counts are deliberately absent —
 * the HBPR cannot action either.
 */
const buildCards = (n: HbprNeedsAttention, year: number): Card[] => {
  const cards: Card[] = [
    {
      key: "cadence_overdue",
      icon: CalendarClock,
      tone: "danger",
      count: n.cadence_overdue,
      title: "Cadence meetings overdue",
      action: `Review ${plural(n.cadence_overdue, "team leader", "team leaders")}`,
      to: `/hbpr?view=leaders&year=${year}`,
    },
    {
      key: "cadence_due",
      icon: CalendarClock,
      tone: "warning",
      count: n.cadence_due,
      title: "Cadence meetings due now",
      action: `Review ${plural(n.cadence_due, "team leader", "team leaders")}`,
      to: `/hbpr?view=leaders&year=${year}`,
    },
    {
      key: "missing_mid_year",
      icon: FileClock,
      tone: "info",
      count: n.missing_mid_year_evidence,
      title: "Mid-year EPR evidence missing",
      action: `Open ${plural(n.missing_mid_year_evidence, "record", "records")}`,
      to: `/hbpr?view=evidence&year=${year}`,
    },
    {
      key: "missing_year_end",
      icon: FilePlus2,
      tone: "info",
      count: n.missing_year_end_evidence,
      title: "Year-end EPR evidence missing",
      action: `Open ${plural(n.missing_year_end_evidence, "record", "records")}`,
      to: `/hbpr?view=evidence&year=${year}`,
    },
    {
      key: "recent_evidence",
      icon: History,
      tone: "accent",
      count: n.recent_evidence,
      title: "New governance updates",
      action: "Review timeline",
      to: `/hbpr?view=evidence&year=${year}`,
    },
  ];
  return cards.filter((card) => card.count > 0);
};

interface HbprAttentionSummaryProps {
  attention: HbprNeedsAttention;
  recentDays: number;
  year: number;
}

export const HbprAttentionSummary: React.FC<HbprAttentionSummaryProps> = ({
  attention,
  recentDays,
  year,
}) => {
  const cards = buildCards(attention, year);
  return (
    <section aria-labelledby="hbpr-attention" className="space-y-3">
      <h2 id="hbpr-attention" className="text-foreground text-base font-bold tracking-tight">
        Needs your attention
      </h2>
      {cards.length === 0 ? (
        <InfoCallout
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          label="Nothing needs your attention"
          value="Cadence and EPR evidence are up to date for your assigned team leaders."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map(({ key, icon: Icon, tone, count, title, action, to }) => (
            <li key={key}>
              <GlassCard
                animateOnMount={false}
                isHoverLift={false}
                className={cn(
                  "flex h-full flex-col gap-3 border-l-4 p-4",
                  key === "cadence_overdue" ? "border-l-tone-danger-text" : "border-l-transparent"
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
                      toneSurfaceClass[tone],
                      // motion-safe: the pulse never runs under prefers-reduced-motion.
                      key === "cadence_overdue" && "motion-safe:animate-pulse"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "font-mono text-2xl font-bold tabular-nums",
                        toneTextClass[tone]
                      )}
                    >
                      {count}
                    </p>
                    <p className="text-sm font-medium">{title}</p>
                    {key === "recent_evidence" && (
                      <p className="text-muted-foreground text-xs">
                        Recorded in the last {recentDays} days
                      </p>
                    )}
                  </div>
                </div>
                <Button asChild variant="outline" className="mt-auto min-h-11 sm:min-h-10">
                  <Link to={to}>{action}</Link>
                </Button>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
