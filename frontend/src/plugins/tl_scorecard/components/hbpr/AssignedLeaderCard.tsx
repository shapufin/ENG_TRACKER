import React from "react";
import { CalendarClock, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import type { HbprLeaderRow } from "../../types/tlScorecard";
import { CADENCE_LABELS, CADENCE_STATUS_LABELS, CADENCE_STATUS_TONE, formatDate } from "./hbprMeta";

const EprPill: React.FC<{ label: string; recorded: boolean }> = ({ label, recorded }) => (
  <Badge variant={recorded ? "success" : "warning"}>
    {label}: {recorded ? "recorded" : "missing"}
  </Badge>
);

/** One assigned Albanian TL as a mobile summary card (the table is desktop-only). */
export const AssignedLeaderCard: React.FC<{ leader: HbprLeaderRow }> = ({ leader }) => (
  <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{leader.name}</p>
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
          <UsersRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {leader.team_size} {leader.team_size === 1 ? "member" : "members"} ·{" "}
          {CADENCE_LABELS[leader.cadence]}
        </p>
      </div>
      <Badge variant={CADENCE_STATUS_TONE[leader.cadence_status]}>
        {CADENCE_STATUS_LABELS[leader.cadence_status]}
      </Badge>
    </div>

    <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
      <div>
        <dt className="text-muted-foreground">Last HBPR meeting</dt>
        <dd className="mt-0.5 font-medium tabular-nums">{formatDate(leader.last_meeting_on)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Next due</dt>
        <dd className="mt-0.5 flex items-center gap-1.5 font-medium tabular-nums">
          <CalendarClock
            className="text-muted-foreground h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {formatDate(leader.next_due_on)}
        </dd>
      </div>
    </dl>

    <div className="mt-3 flex flex-wrap gap-2">
      <EprPill label="Mid-year" recorded={leader.epr_mid_year} />
      <EprPill label="Year-end" recorded={leader.epr_year_end} />
    </div>
  </GlassCard>
);
