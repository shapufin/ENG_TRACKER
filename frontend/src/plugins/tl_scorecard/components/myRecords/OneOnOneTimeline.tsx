import React, { useState } from "react";
import { SearchX } from "lucide-react";
import { UserAvatar } from "@/components/calendar/UserAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { SearchField } from "@/components/ui/SearchField";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { avatarSeed } from "../avatarSeed";
import type { MyOneOnOne } from "../../types/myRecords";

const matches = (o: MyOneOnOne, q: string) =>
  [o.summary, o.with_name, o.occurred_on, formatDateDDMMYYYY(o.occurred_on)].some((v) =>
    v.toLowerCase().includes(q)
  );

export const OneOnOneTimeline: React.FC<{ items: MyOneOnOne[] }> = ({ items }) => {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const sorted = [...items]
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
    .filter((o) => !q || matches(o, q));
  return (
    <section aria-labelledby="my-121-heading" className="space-y-3">
      <h2 id="my-121-heading" className="text-lg font-semibold">
        1-on-1s
      </h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Summaries your team leader shares will appear here.
        </p>
      ) : (
        <>
          <SearchField
            aria-label="Search 1-on-1s"
            placeholder="Search by keyword or date"
            value={query}
            onChange={setQuery}
          />
          {sorted.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No 1-on-1s match"
              description="Try another keyword or date."
              className="py-8"
            />
          ) : (
            <ul className="border-border ml-3.5 space-y-3 border-l-2 pl-8">
              {sorted.map((o) => (
                <li key={o.id} className="relative">
                  <span className="absolute top-3 -left-[2.95rem]">
                    <UserAvatar name={o.with_name} size="sm" colorSeed={avatarSeed(o.with_name)} />
                  </span>
                  <GlassCard className="space-y-1 p-4">
                    <p className="text-sm font-medium">
                      <time dateTime={o.occurred_on}>{formatDateDDMMYYYY(o.occurred_on)}</time>
                      <span className="text-muted-foreground font-normal"> with {o.with_name}</span>
                    </p>
                    <p className="text-sm break-words whitespace-pre-wrap">{o.summary}</p>
                  </GlassCard>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};
