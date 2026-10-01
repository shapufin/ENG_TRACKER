import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { MyOneOnOne } from "../../types/myRecords";

export const OneOnOneTimeline: React.FC<{ items: MyOneOnOne[] }> = ({ items }) => {
  const sorted = [...items].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  return (
    <section aria-labelledby="my-121-heading" className="space-y-3">
      <h2 id="my-121-heading" className="text-lg font-semibold">
        1-on-1s
      </h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Summaries your team leader shares will appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((o) => (
            <li key={o.id}>
              <GlassCard className="space-y-1 p-4">
                <p className="text-sm font-medium">
                  <time dateTime={o.occurred_on}>{formatDateDDMMYYYY(o.occurred_on)}</time>
                  <span className="font-normal text-muted-foreground"> with {o.with_name}</span>
                </p>
                <p className="whitespace-pre-wrap text-sm">{o.summary}</p>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
