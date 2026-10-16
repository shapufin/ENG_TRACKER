import React from "react";
import type { TLFilter } from "@/types";

interface UserStats {
  total_users: number;
  italian_tl_count: number;
  albanian_tl_count: number;
  no_tl_count: number;
  active_today_count: number;
}

interface UserStatsStripProps {
  stats: UserStats;
  noTechCount: number;
  tlFilter: TLFilter;
  noTechOnly: boolean;
  onTlFilterToggle: (filter: TLFilter) => void;
  onNoTechToggle: () => void;
}

const ITEM_CLASS =
  "flex items-baseline gap-2 rounded-lg border px-2.5 py-1 text-left transition-colors motion-reduce:transition-none";
const PRESSED_CLASS = "border-primary/40 bg-primary/10";
const IDLE_CLASS = "border-transparent";

/**
 * One slim row of headline counts. The Italian TL, Albanian TL and No Tech
 * counts are toggles that drive the same role/tech filters as the filter bar
 * (the list narrows server-side). Total, No TL and Active today are display
 * only: the server has no filter behind them.
 */
export const UserStatsStrip: React.FC<UserStatsStripProps> = ({
  stats,
  noTechCount,
  tlFilter,
  noTechOnly,
  onTlFilterToggle,
  onNoTechToggle,
}) => {
  const toggles = [
    {
      label: "Italian TL",
      value: stats.italian_tl_count,
      pressed: tlFilter === "italian_tl",
      onClick: () => onTlFilterToggle("italian_tl"),
    },
    {
      label: "Albanian TL",
      value: stats.albanian_tl_count,
      pressed: tlFilter === "albanian_tl",
      onClick: () => onTlFilterToggle("albanian_tl"),
    },
    { label: "No Tech", value: noTechCount, pressed: noTechOnly, onClick: onNoTechToggle },
  ];
  const statics = [
    { label: "Total users", value: stats.total_users },
    { label: "No TL", value: stats.no_tl_count },
    { label: "Active today", value: stats.active_today_count },
  ];

  return (
    <div className="border-border/70 bg-card shadow-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3 py-2">
      {statics.map(({ label, value }) => (
        <div key={label} className={`${ITEM_CLASS} ${IDLE_CLASS} cursor-default`}>
          <span className="text-muted-foreground text-xs font-medium">{label}</span>
          <span className="text-foreground text-lg font-semibold tabular-nums">{value}</span>
        </div>
      ))}
      <span aria-hidden="true" className="bg-border/70 hidden h-6 w-px sm:block" />
      {toggles.map(({ label, value, pressed, onClick }) => (
        <button
          key={label}
          type="button"
          aria-pressed={pressed}
          onClick={onClick}
          className={`${ITEM_CLASS} ${pressed ? PRESSED_CLASS : `${IDLE_CLASS} hover:bg-muted/60`} focus-visible:ring-focus cursor-pointer focus-visible:ring-2 focus-visible:outline-hidden`}
        >
          <span className="text-muted-foreground text-xs font-medium">{label}</span>
          <span className="text-foreground text-lg font-semibold tabular-nums">{value}</span>
        </button>
      ))}
    </div>
  );
};
