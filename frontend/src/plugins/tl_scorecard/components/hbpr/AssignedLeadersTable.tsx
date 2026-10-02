import React from "react";
import { Link } from "react-router-dom";
import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import type { HbprLeaderRow } from "../../types/tlScorecard";
import { AssignedLeaderCard } from "./AssignedLeaderCard";
import { CADENCE_LABELS, CADENCE_STATUS_LABELS, CADENCE_STATUS_TONE, formatDate } from "./hbprMeta";

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
    <section aria-labelledby="hbpr-leaders" className="space-y-3">
      <h2 id="hbpr-leaders" className="text-muted-foreground text-sm font-semibold">
        Assigned Albanian team leaders
      </h2>

      <ul className="grid gap-3 md:hidden">
        {leaders.map((leader) => (
          <li key={leader.assignment_id}>
            <AssignedLeaderCard leader={leader} />
          </li>
        ))}
      </ul>

      <GlassCard animateOnMount={false} isHoverLift={false} className="hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Assigned Albanian team leaders and their governance state
            </caption>
            <thead>
              <tr className="border-border/60 text-muted-foreground border-b text-xs tracking-wide uppercase">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Albanian TL
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Team
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Cadence
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Last HBPR meeting
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Next due
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  EPR evidence
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  State
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border/50 divide-y">
              {leaders.map((leader) => (
                <tr key={leader.assignment_id}>
                  <th scope="row" className="max-w-[14rem] truncate px-4 py-2.5 font-medium">
                    {leader.name}
                  </th>
                  <td className="px-4 py-2.5 tabular-nums">{leader.team_size}</td>
                  <td className="px-4 py-2.5">{CADENCE_LABELS[leader.cadence]}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatDate(leader.last_meeting_on)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatDate(leader.next_due_on)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <EprCell label="Mid-year" recorded={leader.epr_mid_year} />
                      <EprCell label="Year-end" recorded={leader.epr_year_end} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={CADENCE_STATUS_TONE[leader.cadence_status]}>
                      {CADENCE_STATUS_LABELS[leader.cadence_status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      to={`/hbpr?view=evidence&year=${year}&leader=${leader.id}`}
                      aria-label={`Open governance evidence for ${leader.name}`}
                      className="text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline sm:min-h-0"
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
