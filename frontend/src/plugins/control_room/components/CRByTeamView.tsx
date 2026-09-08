/**
 * CRByTeamView — groups the roster by team, then by user.
 *
 * One GlassCard per team. Inside each card, a compact list of users
 * (aggregated — one entry per person, not per shift) showing their
 * date range. Collapsible.
 *
 * Pure client-side grouping of the already-fetched roster rows. No
 * new endpoints. Status column removed (approved-only dashboard).
 * Coverage % badge and shifts badge removed per user feedback — CR
 * users need who is on standby and when, not coverage metrics or
 * shift counts.
 */
import React, { useMemo, useState } from "react";
import { ChevronDown, Moon, Users } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ControlRoomCoverage, ControlRoomRosterRow } from "../types";
import { aggregateByTeamThenUser, type TeamAggregatedGroup } from "../utils/rosterAggregation";
import { formatHours, formatDate } from "../utils/controlRoomFormatters";
import { initialsOf, teamColorFor } from "../utils/crViewHelpers";

interface Props {
  coverage: ControlRoomCoverage[];
  roster: ControlRoomRosterRow[];
}

const TeamCard: React.FC<{
  group: TeamAggregatedGroup;
  coverage?: ControlRoomCoverage;
}> = ({ group, coverage }) => {
  const [open, setOpen] = useState(true);

  return (
    <GlassCard delay={0} isHoverLift={false}>
      <div className="flex flex-row items-center justify-between gap-2 border-b border-border/40 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", teamColorFor(group.team_name))} />
              <h3 className="text-base font-semibold">{group.team_name}</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {group.users.length} {group.users.length === 1 ? "person" : "people"} on standby
              {coverage && ` · ${formatHours(coverage.planned_hours)} planned`}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
        </Button>
      </div>
      {open && (
        <div className="p-4 pt-0">
          {group.users.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No standby scheduled in this range.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {group.users.map((user) => (
                <li key={user.user_id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {initialsOf(user.user_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{user.user_name}</span>
                      {user.has_overnight && (
                        <Moon className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(user.first_date)} – {formatDate(user.last_date)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </GlassCard>
  );
};

export const CRByTeamView: React.FC<Props> = ({ coverage, roster }) => {
  const groups = useMemo(() => aggregateByTeamThenUser(roster), [roster]);
  const coverageByName = useMemo(() => new Map(coverage.map((c) => [c.team_name, c])), [coverage]);

  if (groups.length === 0) {
    return (
      <GlassCard delay={0}>
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No teams in scope for this range.
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <TeamCard key={g.team_name} group={g} coverage={coverageByName.get(g.team_name)} />
      ))}
    </div>
  );
};
