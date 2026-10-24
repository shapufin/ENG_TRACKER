import { Badge } from "@/components/ui/badge";
import type { OvertimeLog } from "@/types";

type Props = {
  log: Pick<OvertimeLog, "hours" | "paid_window_start" | "paid_window_end">;
};

const clock = (value: string) => value.slice(0, 5);

/**
 * The hours an overtime entry is paid, plus the paid block it shares with
 * other entries that start inside the same hour. An entry whose hour is
 * already covered by another entry is paid 0h and says so.
 */
export function OvertimeHoursBadge({ log }: Props) {
  const hours = Number(Number(log.hours).toFixed(2));
  const window =
    log.paid_window_start && log.paid_window_end
      ? `${clock(log.paid_window_start)}-${clock(log.paid_window_end)}`
      : null;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge variant="secondary" className="rounded-full font-mono text-xs">
        {hours}h
      </Badge>
      {window && (
        <span
          className="text-xs text-muted-foreground"
          title="Entries that start within the same paid hour share it."
        >
          {hours === 0 ? `Covered by ${window}` : `Block ${window}`}
        </span>
      )}
    </span>
  );
}
