import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardList, PhoneOff, TrendingUp, UserX, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";
import type { HbprOverview } from "../../types/tlScorecard";

const RECORDS = "/tl-scorecard?tab=records";

interface Card {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  count: number;
  title: string;
  detail?: string;
  to: string;
  action: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const buildCards = ({ needs_attention: n, one_on_one_stale_days, absence_overdue_days }: HbprOverview): Card[] => {
  const cards: Card[] = [
    {
      key: "pips",
      icon: ClipboardList,
      tone: "warning",
      count: n.pips_awaiting_approval,
      title: "Improvement plans awaiting approval",
      detail: n.oldest_pip_days === null ? undefined : `Oldest has waited ${plural(n.oldest_pip_days, "day", "days")}`,
      to: `${RECORDS}&kind=pips`,
      action: `Review ${plural(n.pips_awaiting_approval, "plan", "plans")}`,
    },
    {
      key: "promotions",
      icon: TrendingUp,
      tone: "info",
      count: n.promotions_to_decide,
      title: "Promotions to decide",
      to: `${RECORDS}&kind=promotions`,
      action: `Review ${plural(n.promotions_to_decide, "nomination", "nominations")}`,
    },
    {
      key: "absences",
      icon: UserX,
      tone: "warning",
      count: n.absences_overdue,
      title: `Absences unaddressed for ${absence_overdue_days}+ days`,
      to: `${RECORDS}&kind=absences`,
      action: `Review ${plural(n.absences_overdue, "absence", "absences")}`,
    },
    {
      key: "meetings",
      icon: PhoneOff,
      tone: "info",
      count: n.tls_behind_on_one_on_ones,
      title: `Team leaders behind on 1-on-1s (${one_on_one_stale_days}+ days)`,
      to: `${RECORDS}&kind=meetings`,
      action: `Review ${plural(n.tls_behind_on_one_on_ones, "team leader", "team leaders")}`,
    },
  ];
  return cards.filter((c) => c.count > 0);
};

export const NeedsAttention: React.FC<{ overview: HbprOverview }> = ({ overview }) => {
  const cards = buildCards(overview);
  return (
    <section aria-labelledby="hbpr-attention" className="space-y-3">
      <h2 id="hbpr-attention" className="text-lg font-semibold">
        Needs your attention
      </h2>
      {cards.length === 0 ? (
        <InfoCallout tone="success" icon={<CheckCircle2 className="h-4 w-4" />} label="Nothing needs your attention" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map(({ key, icon: Icon, tone, count, title, detail, to, action }) => (
            <li key={key}>
              <GlassCard animateOnMount={false} isHoverLift={false} className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${toneSurfaceClass[tone]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tabular-nums">{count}</p>
                    <p className="text-sm font-medium">{title}</p>
                    {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
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
