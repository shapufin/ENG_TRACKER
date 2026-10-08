import React from "react";
import { UserCheck } from "lucide-react";
import { WidgetFrame } from "./WidgetFrame";
import type { TrendWidgetProps } from "./trendTypes";

/** Keep in sync with WHO_IS_OUT_LIMIT in apps/dashboard/admin_trends.py. */
const LIMIT = 20;

const label = (name: string, team: string | null) => (team ? `${name} · ${team}` : name);

export const WhoIsOutWidget: React.FC<TrendWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const out = data?.who_is_out;
  const leave = out?.on_leave ?? [];
  const standby = out?.on_standby ?? [];
  const nobody = leave.length === 0 && standby.length === 0;
  const capped = leave.length >= LIMIT || standby.length >= LIMIT;
  return (
    <WidgetFrame
      sectionId="who-is-out"
      title="Who's Out Today"
      description={
        out ? `${out.upcoming_leave_14d} more starting leave in the next 14 days` : undefined
      }
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={nobody ? { icon: UserCheck, title: "Nobody is out today" } : null}
    >
      <div className="space-y-4 text-xs">
        {leave.length > 0 && (
          <section aria-label="On leave">
            <h4 className="text-muted-foreground mb-1 font-semibold tracking-wider uppercase">
              On leave ({leave.length})
            </h4>
            <ul className="space-y-1">
              {leave.map((p) => (
                <li key={`l${p.user_id}`} className="flex justify-between gap-2">
                  <span className="truncate">{label(p.name, p.team)}</span>
                  <span className="text-muted-foreground font-mono">until {p.until}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {standby.length > 0 && (
          <section aria-label="On standby">
            <h4 className="text-muted-foreground mb-1 font-semibold tracking-wider uppercase">
              On standby ({standby.length})
            </h4>
            <ul className="space-y-1">
              {standby.map((p) => (
                <li key={`s${p.user_id}`} className="truncate">
                  {label(p.name, p.team)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {capped && <p className="text-muted-foreground">Showing the first {LIMIT} per list.</p>}
      </div>
    </WidgetFrame>
  );
};
