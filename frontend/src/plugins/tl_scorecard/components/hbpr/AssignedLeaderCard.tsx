import React from "react";
import { Link } from "react-router-dom";
import { CalendarClock, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { UserAvatar } from "@/components/calendar/UserAvatar";
import type { HbprLeaderRow } from "../../types/tlScorecard";
import { avatarSeed } from "../avatarSeed";
import { CADENCE_LABELS, CADENCE_STATUS_LABELS, CADENCE_STATUS_TONE, formatDate } from "./hbprMeta";

const EprPill: React.FC<{ label: string; recorded: boolean }> = ({ label, recorded }) => (
  <Badge variant={recorded ? "success" : "warning"}>
    {label}: {recorded ? "recorded" : "missing"}
  </Badge>
);

interface AssignedLeaderCardProps {
  leader: HbprLeaderRow;
  year: number;
}

/** One assigned Albanian TL as a mobile summary card (the table is desktop-only). */
export const AssignedLeaderCard: React.FC<AssignedLeaderCardProps> = ({ leader, year }) => (
  <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <UserAvatar name={leader.name} size="sm" colorSeed={avatarSeed(leader.name)} />
        <div className="min-w-0">
          <p className="truncate font-semibold" title={leader.name}>
            {leader.name}
          </p>
          <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
            <UsersRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {leader.team_size} {leader.team_size === 1 ? "member" : "members"} ·{" "}
            {CADENCE_LABELS[leader.cadence]}
          </p>
        </div>
      </div>
      <Badge variant={CADENCE_STATUS_TONE[leader.cadence_status]}>
        {CADENCE_STATUS_LABELS[leader.cadence_status]}
      </Badge>
    </div>

    <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
      <div>
        <dt className="text-muted-foreground">Last HBPR meeting</dt>
        <dd className="mt-0.5 font-medium whitespace-nowrap tabular-nums">
          {formatDate(leader.last_meeting_on)}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Next due</dt>
        <dd className="mt-0.5 flex items-center gap-1.5 font-medium whitespace-nowrap tabular-nums">
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

    <div className="border-line-subtle mt-3 border-t pt-3">
      <Button variant="outline" size="sm" asChild className="min-h-11 w-full shadow-sm">
        <Link
          to={`/hbpr?view=evidence&year=${year}&leader=${leader.id}`}
          aria-label={`Open partnership log for ${leader.name}`}
        >
          Partnership log
        </Link>
      </Button>
    </div>
  </GlassCard>
);
