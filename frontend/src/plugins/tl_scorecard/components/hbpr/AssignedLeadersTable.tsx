import React from "react";
import { Link } from "react-router-dom";
import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  TABLE_BODY_CELL_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_HOVER_CLASS,
} from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";
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
  <Badge variant={recorded ? "success" : "warning"} className="whitespace-nowrap">
    {label}: {recorded ? "logged" : "not logged"}
  </Badge>
);

// This table is denser than the app's other tables (8 columns plus stacked EPR
// pills), so the contract's default `px-4` pushes the row action past the card
// edge at 1280 — measured: table 1023px in a 950px container, action 56px over.
// Compose a tighter horizontal padding rather than forking the contract; `cn`
// (tailwind-merge) resolves the padding group so `px-3` wins.
const HEAD_CELL = cn(TABLE_HEAD_CELL_CLASS, "px-3");
const BODY_CELL = cn(TABLE_BODY_CELL_CLASS, "px-3");

interface AssignedLeadersTableProps {
  leaders: HbprLeaderRow[];
  /** Reporting year, for the per-leader records/evidence deep links. */
  year: number;
}

/** Assigned Albanian TLs: a semantic table on desktop, summary cards on mobile. */
export const AssignedLeadersTable: React.FC<AssignedLeadersTableProps> = ({ leaders, year }) => {
  if (leaders.length === 0) {
    return (
      <GlassCard animateOnMount={false} className="p-0">
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
            <AssignedLeaderCard leader={leader} year={year} />
          </li>
        ))}
      </ul>

      <GlassCard
        animateOnMount={false}
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
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th scope="col" className={HEAD_CELL}>
                  Albanian TL
                </th>
                <th scope="col" className={HEAD_CELL}>
                  Team
                </th>
                <th scope="col" className={HEAD_CELL}>
                  Cadence
                </th>
                <th scope="col" className={HEAD_CELL}>
                  Last HBPR meeting
                </th>
                <th scope="col" className={HEAD_CELL}>
                  Next due
                </th>
                <th scope="col" className={HEAD_CELL}>
                  EPR log
                </th>
                <th scope="col" className={HEAD_CELL}>
                  State
                </th>
                <th scope="col" className={cn(HEAD_CELL, "text-right")}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border/50 divide-y">
              {leaders.map((leader) => (
                <tr key={leader.assignment_id} className={TABLE_ROW_HOVER_CLASS}>
                  <th scope="row" className={cn(BODY_CELL, "font-medium")}>
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
                  <td className={cn(BODY_CELL, "tabular-nums")}>{leader.team_size}</td>
                  <td className={BODY_CELL}>{CADENCE_LABELS[leader.cadence]}</td>
                  <td className={cn(BODY_CELL, "whitespace-nowrap tabular-nums")}>
                    {formatDate(leader.last_meeting_on)}
                  </td>
                  <td className={cn(BODY_CELL, "whitespace-nowrap tabular-nums")}>
                    {formatDate(leader.next_due_on)}
                  </td>
                  <td className={BODY_CELL}>
                    <div className="flex flex-wrap gap-1.5">
                      <EprCell label="Mid-year" recorded={leader.epr_mid_year} />
                      <EprCell label="Year-end" recorded={leader.epr_year_end} />
                    </div>
                  </td>
                  <td className={BODY_CELL}>
                    <Badge
                      variant={CADENCE_STATUS_TONE[leader.cadence_status]}
                      className="whitespace-nowrap"
                    >
                      {CADENCE_STATUS_LABELS[leader.cadence_status]}
                    </Badge>
                  </td>
                  <td className={cn(BODY_CELL, "text-right")}>
                    <Button variant="outline" size="sm" asChild className="shadow-sm">
                      <Link
                        to={`/hbpr?view=evidence&year=${year}&leader=${leader.id}`}
                        aria-label={`Open partnership log for ${leader.name}`}
                      >
                        Partnership log
                      </Link>
                    </Button>
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
