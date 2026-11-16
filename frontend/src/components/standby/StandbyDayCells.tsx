import { Badge } from "@/components/ui/badge";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import {
  dayGroupsFor,
  formatSegmentRange,
  type DayGroupedStandbyLog,
} from "@/lib/standbyDayGroups";
import type { StandbyLog } from "@/types";
import type { AppCellContext } from "@/components/ui/tableTypes";

type Ctx = AppCellContext<StandbyLog>;

const groupOf = ({ table, row }: Ctx) =>
  dayGroupsFor(table.getRowModel().rows).get(row.original.id);

/** Date cell: renders formatted date, with graceful fallback for uncollapsed multi-segment days. */
export const StandbyDateCell = (ctx: Ctx) => {
  if (groupOf(ctx)?.continues) {
    return (
      <span
        className="text-muted-foreground text-xs whitespace-nowrap"
        aria-label="Same day as the row above"
      >
        ↳ same day
      </span>
    );
  }
  return <>{formatDateDDMMYYYY(ctx.row.original.date)}</>;
};

/** Hours badge: combined total badge + separate shift chips for same-day segments. */
export const StandbyHoursCell = (ctx: Ctx) => {
  const log = ctx.row.original as DayGroupedStandbyLog;
  const segments = log.segments;

  if (segments && segments.length > 1) {
    return (
      <div className="flex flex-col items-start gap-1 py-0.5">
        <Badge variant="secondary" className="rounded-full font-mono text-xs font-semibold">
          {log.hours}h
        </Badge>
        <div className="flex flex-wrap items-center gap-1.5">
          {segments.map((seg) => {
            const range = formatSegmentRange(seg);
            return (
              <span
                key={seg.id}
                className="border-border/60 bg-muted/50 text-muted-foreground inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap"
              >
                {range} ({seg.hours}h)
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  const group = groupOf(ctx);
  const range = formatSegmentRange(log);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant="secondary" className="rounded-full font-mono text-xs font-semibold">
        {log.hours}h
      </Badge>
      {range && (
        <span className="text-muted-foreground font-mono text-xs whitespace-nowrap">{range}</span>
      )}
      {group?.isLast && (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          Day total {group.total}h
        </span>
      )}
    </div>
  );
};
