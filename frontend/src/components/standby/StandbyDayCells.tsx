import { Badge } from "@/components/ui/badge";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { dayGroupsFor, formatSegmentRange } from "@/lib/standbyDayGroups";
import type { StandbyLog } from "@/types";
import type { AppCellContext } from "@/components/ui/tableTypes";

type Ctx = AppCellContext<StandbyLog>;

const groupOf = ({ table, row }: Ctx) =>
  dayGroupsFor(table.getRowModel().rows).get(row.original.id);

/** Date cell: the second and later segments of one day show a quiet marker instead. */
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

/** Hours badge, the segment's own time range and, on the last segment, the day total. */
export const StandbyHoursCell = (ctx: Ctx) => {
  const log = ctx.row.original;
  const group = groupOf(ctx);
  const range = formatSegmentRange(log);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant="secondary" className="rounded-full font-mono text-xs">
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
