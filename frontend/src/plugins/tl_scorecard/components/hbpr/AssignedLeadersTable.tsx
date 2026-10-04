import React from "react";
import { Link } from "react-router-dom";
import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { UserAvatar } from "@/components/calendar/UserAvatar";
import type { HbprLeaderRow } from "../../types/tlScorecard";
import { avatarSeed } from "../avatarSeed";
import { AssignedLeaderCard } from "./AssignedLeaderCard";
import {
  CADENCE_LABELS,
  CADENCE_STATUS_LABELS,
  CADENCE_STATUS_TONE,
  formatDate,
  plural,
} from "./hbprMeta";

const EprCell: React.FC<{ label: string; recorded: boolean }> = ({ label, recorded }) => (
  <Badge variant={recorded ? "success" : "warning"}>
    {label}: {recorded ? "recorded" : "missing"}
  </Badge>
);

interface AssignedLeadersTableProps {
  leaders: HbprLeaderRow[];
  /** Reporting year, for the per-leader records/evidence deep links. */
  year: number;
}

/** Assigned Albanian TLs: a semantic table on desktop, summary cards on mobile. */
export const AssignedLeadersTable: React.FC<AssignedLeadersTableProps> = ({ leaders, year }) => {
  if (leaders.length === 0) {
    return (
      <GlassCard animateOnMount={false} isHoverLift={false} className="p-0">
        <EmptyState
          icon={UsersRound}
          title="No Albanian team leaders assigned yet"
          description="An administrator assigns Albanian team leaders to an HBPR from the HBPR assignments page."
          className="py-10"
        />
      </GlassCard>
    );
  }

  return (
    <section aria-label="Assigned Albanian team leaders" className="space-y-3">
      <ul className="grid gap-3 md:hidden">
        {leaders.map((leader) => (
          <li key={leader.assignment_id}>
            <AssignedLeaderCard leader={leader} />
          </li>
        ))}
      </ul>

      <GlassCard
        animateOnMount={false}
        isHoverLift={false}
        className="hidden overflow-hidden p-0 md:block"
      >
        <div className="border-line-subtle flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 className="text-foreground flex items-center gap-2 text-sm font-bold tracking-wider uppercase">
            Assigned Albanian team leaders
            <span className="bg-tone-success-text h-1.5 w-1.5 rounded-full" aria-hidden="true" />
          </h2>
          <span className="text-muted-foreground text-xs">
            {plural(leaders.length, "team leader", "team leaders")}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Assigned Albanian team leaders and their governance state
            </caption>
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr className="border-border/50 border-b">
                <th scope="col" className="px-4 py-2 font-medium">
                  Albanian TL
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Team
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Cadence
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Last HBPR meeting
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Next due
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  EPR evidence
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  State
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border/50 divide-y">
              {leaders.map((leader) => (
                <tr key={leader.assignment_id}>
                  <th scope="row" className="px-4 py-2.5 font-medium">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <UserAvatar
                        name={leader.name}
                        size="sm"
                        colorSeed={avatarSeed(leader.name)}
                      />
                      <span className="max-w-[14rem] truncate" title={leader.name}>
                        {leader.name}
                      </span>
                    </div>
                  </th>
                  <td className="px-4 py-2.5 tabular-nums">{leader.team_size}</td>
                  <td className="px-4 py-2.5">{CADENCE_LABELS[leader.cadence]}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                    {formatDate(leader.last_meeting_on)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                    {formatDate(leader.next_due_on)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <EprCell label="Mid-year" recorded={leader.epr_mid_year} />
                      <EprCell label="Year-end" recorded={leader.epr_year_end} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={CADENCE_STATUS_TONE[leader.cadence_status]}
                      className="whitespace-nowrap"
                    >
                      {CADENCE_STATUS_LABELS[leader.cadence_status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      to={`/hbpr?view=evidence&year=${year}&leader=${leader.id}`}
                      aria-label={`Open governance evidence for ${leader.name}`}
                      className="text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline sm:min-h-6"
                    >
                      Evidence
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </section>
  );
};
