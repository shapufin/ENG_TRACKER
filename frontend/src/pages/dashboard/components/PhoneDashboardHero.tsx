import React from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { User } from "@/types";

interface PhoneDashboardHeroProps {
  user: User | null;
  personalOvertimeHours: number;
  personalStandbyHours: number;
  pendingCount: number;
}

/**
 * Phone-only greeting card and pending strip (the two things the AI Studio
 * mockup puts first). Everything here is already on the page further down:
 * the card restates the period hours, the strip jumps to the pending list.
 */
export const PhoneDashboardHero: React.FC<PhoneDashboardHeroProps> = ({
  user,
  personalOvertimeHours,
  personalStandbyHours,
  pendingCount,
}) => {
  const name = user?.first_name || user?.username || "there";
  return (
    <div className="space-y-3 md:hidden" data-testid="phone-dashboard-hero">
      <section className="from-primary to-primary/70 text-primary-foreground rounded-2xl bg-gradient-to-br p-5 shadow-lg">
        <p className="text-xs font-medium tracking-wider uppercase opacity-80">Welcome back</p>
        <h2 className="mt-1 text-2xl font-bold">Hello, {name}!</h2>
        <p className="mt-2 text-sm opacity-90">
          {personalOvertimeHours}h overtime · {personalStandbyHours}h standby this period
        </p>
      </section>
      {pendingCount > 0 && (
        <a
          href="#my-pending"
          className="border-warning/40 bg-warning/10 text-foreground focus-visible:ring-ring flex min-h-11 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="text-tone-warning-text h-4 w-4 shrink-0" aria-hidden="true" />
            {pendingCount} pending {pendingCount === 1 ? "approval" : "approvals"}
          </span>
          <span className="flex items-center gap-1">
            Review <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </a>
      )}
    </div>
  );
};
