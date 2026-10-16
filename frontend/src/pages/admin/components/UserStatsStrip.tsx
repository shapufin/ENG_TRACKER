import React from "react";

interface UserStats {
  total_users: number;
  italian_tl_count: number;
  albanian_tl_count: number;
  no_tl_count: number;
  active_today_count: number;
}

const ITEMS: { key: keyof UserStats; label: string }[] = [
  { key: "total_users", label: "Total users" },
  { key: "italian_tl_count", label: "Italian TL" },
  { key: "albanian_tl_count", label: "Albanian TL" },
  { key: "no_tl_count", label: "No TL" },
  { key: "active_today_count", label: "Active today" },
];

/** One slim row of headline counts, so the table stays near the top of the page. */
export const UserStatsStrip: React.FC<{ stats: UserStats }> = ({ stats }) => (
  <dl className="border-border/70 bg-card shadow-card flex flex-wrap items-baseline gap-x-8 gap-y-1 rounded-xl border px-4 py-2.5">
    {ITEMS.map(({ key, label }) => (
      <div key={key} className="flex items-baseline gap-2">
        <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
        <dd className="text-foreground text-lg font-semibold tabular-nums">{stats[key]}</dd>
      </div>
    ))}
  </dl>
);
