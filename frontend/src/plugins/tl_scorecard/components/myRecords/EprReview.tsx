import React from "react";
import { Check } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { MyEprCycle } from "../../types/myRecords";

const stepsOf = (c: MyEprCycle) => [
  { label: "Goal setting", at: c.goal_setting_completed_at },
  { label: "Mid-year", at: c.mid_year_completed_at },
  { label: "Final review", at: c.final_review_completed_at },
];

const Stepper: React.FC<{ cycle: MyEprCycle }> = ({ cycle }) => {
  const steps = stepsOf(cycle);
  const currentIdx = steps.findIndex((s) => !s.at);
  return (
    <ol className="space-y-2" aria-label={`${cycle.year} review progress`}>
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
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
          >
            <span
              className={
                s.at
                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-tone-info-surface text-tone-info-text"
                  : "flex h-6 w-6 items-center justify-center rounded-full bg-tone-neutral-surface text-tone-neutral-text"
              }
              aria-hidden="true"
            >
              {s.at ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="font-medium">{s.label}</span>
            <span className="text-muted-foreground">{status}</span>
          </li>
        );
      })}
    </ol>
  );
};

const Goals: React.FC<{ goals: MyEprCycle["goals"] }> = ({ goals }) =>
  goals.length > 0 ? (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {goals.map((g) => (
        <li key={g.id}>{g.description}</li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">No goals have been shared yet.</p>
  );

export const EprReview: React.FC<{ cycles: MyEprCycle[] }> = ({ cycles }) => {
  const [latest, ...older] = [...cycles].sort((a, b) => b.year - a.year);
  return (
    <section aria-labelledby="my-review-heading" className="space-y-3">
      <h2 id="my-review-heading" className="text-lg font-semibold">
        Review
      </h2>
      <GlassCard className="space-y-4 p-4">
        <h3 className="text-sm font-semibold">{latest.year} review</h3>
        <Stepper cycle={latest} />
        <Goals goals={latest.goals} />
      </GlassCard>
      {older.map((c) => (
        <details key={c.id} className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">{c.year} review</summary>
          <div className="mt-3 space-y-4">
            <Stepper cycle={c} />
            <Goals goals={c.goals} />
          </div>
        </details>
      ))}
    </section>
  );
};
