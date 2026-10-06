import React, { useState } from "react";
import { Check } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { toneSurfaceClass } from "@/components/ui/tone";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { cn } from "@/lib/utils";
import type { MyEprCycle } from "../../types/myRecords";
import { stepsOf } from "./eprSteps";

const STAGE_LABELS: Record<string, string> = {
  goal_setting: "Goal setting",
  mid_year: "Mid-year",
  final_review: "Final review",
};

const Stepper: React.FC<{ cycle: MyEprCycle }> = ({ cycle }) => {
  const steps = stepsOf(cycle);
  const currentIdx = steps.findIndex((s) => !s.at);
  return (
    <ol aria-label={`${cycle.year} review progress`}>
      {steps.map((s, i) => {
        const status = s.at
          ? `Completed ${formatDateDDMMYYYY(s.at)}`
          : i === currentIdx
            ? "In progress"
            : "Not started";
        return (
          <li
            key={s.label}
            aria-current={i === currentIdx ? "step" : undefined}
            className="relative flex gap-3 pb-5 last:pb-0"
          >
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-7 bottom-0 left-3 w-0.5 -translate-x-1/2 rounded-full",
                  s.at ? "bg-tone-info-border" : "bg-border"
                )}
              />
            )}
            <span
              className={cn(
                "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                s.at
                  ? toneSurfaceClass.info
                  : i === currentIdx
                    ? cn(toneSurfaceClass.accent, "ring-tone-accent-surface ring-4")
                    : toneSurfaceClass.neutral
              )}
              aria-hidden="true"
            >
              {s.at ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0 text-sm">
              <span className="font-medium">{s.label}</span>
              <span className="text-muted-foreground block">{status}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const SUBHEAD = "text-muted-foreground text-xs font-semibold tracking-wider uppercase";

const Goals: React.FC<{ goals: MyEprCycle["goals"] }> = ({ goals }) => (
  <div>
    <h4 className={SUBHEAD}>Shared goals</h4>
    {goals.length > 0 ? (
      <ul className="mt-2 flex flex-wrap gap-2">
        {goals.map((g) => (
          <li
            key={g.id}
            className={cn(
              "max-w-full rounded-xl border px-3 py-1.5 text-sm break-words",
              toneSurfaceClass.neutral
            )}
          >
            {g.description}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-muted-foreground mt-2 text-sm">No goals have been shared yet.</p>
    )}
  </div>
);

/** Stage summaries the TL marked "Share with employee" — already filtered
 * server-side; nothing private reaches this list. */
const SharedSummaries: React.FC<{ summaries: MyEprCycle["stage_summaries"] }> = ({ summaries }) =>
  summaries.length > 0 ? (
    <div>
      <h4 className={SUBHEAD}>Shared by your team leader</h4>
      <ul className="mt-2 space-y-2">
        {summaries.map((s) => (
          <li
            key={s.stage}
            className={cn("rounded-xl border px-3 py-2 text-sm", toneSurfaceClass.info)}
          >
            <span className="font-semibold">{STAGE_LABELS[s.stage] ?? s.stage}</span>
            <p className="mt-0.5 break-words whitespace-pre-wrap">{s.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

export const EprReview: React.FC<{ cycles: MyEprCycle[] }> = ({ cycles }) => {
  const sorted = [...cycles].sort((a, b) => b.year - a.year);
  const [selectedYear, setSelectedYear] = useState(sorted[0].year);
  const cycle = sorted.find((c) => c.year === selectedYear) ?? sorted[0];
  return (
    <section aria-labelledby="my-review-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-review-heading" className="text-lg font-semibold">
          Review
        </h2>
        {sorted.length > 1 && (
          <div role="group" aria-label="Review year" className="flex flex-wrap gap-1.5">
            {sorted.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.year === cycle.year}
                onClick={() => setSelectedYear(c.year)}
                className={cn(
                  "focus-visible:ring-ring min-h-11 rounded-full border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-hidden sm:min-h-9",
                  c.year === cycle.year
                    ? toneSurfaceClass.accent
                    : "bg-card border-input hover:bg-accent"
                )}
              >
                {c.year}
              </button>
            ))}
          </div>
        )}
      </div>
      <GlassCard className="space-y-5 p-4">
        <h3 className="text-sm font-semibold">{cycle.year} review</h3>
        <Stepper cycle={cycle} />
        <Goals goals={cycle.goals} />
        <SharedSummaries summaries={cycle.stage_summaries} />
      </GlassCard>
    </section>
  );
};
