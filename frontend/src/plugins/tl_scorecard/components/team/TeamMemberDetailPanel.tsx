import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCell } from "@/components/admin/UserCell";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { toDays } from "@/pages/admin/hooks/leaveBalanceFilters";
import { cn } from "@/lib/utils";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { TeamMemberSummary } from "../../types/tlScorecard";
import {
  EPR_STEPS,
  SENIORITY_LABELS,
  eprStageDone,
  formatWage,
  leaveTypeLabel,
  wageUnavailableReason,
} from "./teamMeta";

interface TeamMemberDetailPanelProps {
  /** Row from the already-loaded team list. Null closes the panel. */
  member: TeamMemberSummary | null;
  onOpenChange: (open: boolean) => void;
}

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 py-2.5">
    <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
    <dd className="min-w-0 text-sm">{children}</dd>
  </div>
);

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({
  id,
  title,
  children,
}) => (
  <section aria-labelledby={id} className="space-y-2">
    <h3 id={id} className="text-foreground text-sm font-semibold">
      {title}
    </h3>
    {children}
  </section>
);

const Dash: React.FC = () => <span className="text-muted-foreground">—</span>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const formatDays = (value: string): string => {
  const days = toDays(value);
  return days === null ? "—" : `${days} d`;
};

/**
 * Read-only summary for one team member. It renders only the row it is given
 * (no request on open); the only navigation is to the Records tab.
 */
export const TeamMemberDetailPanel: React.FC<TeamMemberDetailPanelProps> = ({
  member,
  onOpenChange,
}) => {
  if (!member) return null;

  const { wage, leave, epr, governance, meetings } = member;
  const wageText = formatWage(wage.gross_monthly);
  const unavailableReason = wageUnavailableReason(wage.status);
  const currentYear = new Date().getFullYear();
  const total = toDays(leave.total_days) ?? 0;
  const used = toDays(leave.used_days) ?? 0;
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent side="right" size="panel">
        <DialogHeader className="pr-12">
          <DialogTitle className="sr-only">{member.full_name}</DialogTitle>
          <UserCell
            name={member.full_name}
            subtitle={
              member.seniority_level ? SENIORITY_LABELS[member.seniority_level] : member.email
            }
          />
          <DialogDescription className="sr-only">
            Read-only summary for this team member.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6 py-2">
          <Section id="team-panel-compensation" title="Compensation">
            {wageText ? (
              <p className="font-mono text-2xl font-semibold tabular-nums">{wageText}</p>
            ) : (
              <p className="text-muted-foreground text-sm">{unavailableReason}</p>
            )}
            <dl className="divide-border/60 divide-y">
              <Fact label="Effective from">
                {wage.effective_from ? formatDateDDMMYYYY(wage.effective_from) : <Dash />}
              </Fact>
            </dl>
            <p className="text-muted-foreground text-xs">
              Visible to you as this employee&apos;s team leader.
            </p>
          </Section>

          <Section id="team-panel-time-off" title={`Time off (${currentYear})`}>
            <dl className="divide-border/60 divide-y">
              <Fact label="Available">{formatDays(leave.available_days)}</Fact>
              <Fact label="Used">{formatDays(leave.used_days)}</Fact>
              <Fact label="Pending">{formatDays(leave.pending_days)}</Fact>
              <Fact label="Total">{formatDays(leave.total_days)}</Fact>
            </dl>
            <div
              role="progressbar"
              aria-label="Leave used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={usedPct}
              className="bg-muted h-2 w-full overflow-hidden rounded-full"
            >
              <div className="bg-primary h-full rounded-full" style={{ width: `${usedPct}%` }} />
            </div>
            <div className="space-y-1.5 pt-1">
              <p className="text-muted-foreground text-xs font-medium">Approved leave ahead</p>
              {leave.upcoming.length === 0 ? (
                <p className="text-muted-foreground text-sm">No approved leave ahead.</p>
              ) : (
                <ul className="space-y-1.5">
                  {leave.upcoming.map((item) => (
                    <li
                      key={`${item.start_date}-${item.end_date}-${item.request_type}`}
                      className="text-sm"
                    >
                      {formatDateDDMMYYYY(item.start_date)} – {formatDateDDMMYYYY(item.end_date)} ·{" "}
                      {leaveTypeLabel(item.request_type)} ·{" "}
                      <span>{plural(item.business_days, "business day", "business days")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          <Section id="team-panel-epr" title={`EPR (${epr.year})`}>
            <ol className="space-y-2">
              {EPR_STEPS.map(({ stage, label }) => {
                const done = eprStageDone(epr, stage);
                const next = !done && epr.next_stage === stage;
                return (
                  <li key={stage} className="flex items-center gap-3 text-sm">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-3 w-3 shrink-0 rounded-full border",
                        done ? toneSurfaceClass.success : toneSurfaceClass.neutral
                      )}
                    />
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground text-xs">
                      {done ? "Done" : next ? "Next" : "Pending"}
                    </span>
                  </li>
                );
              })}
            </ol>
            <dl className="divide-border/60 divide-y">
              <Fact label="Goals logged">{epr.goal_count}</Fact>
            </dl>
          </Section>

          <Section id="team-panel-governance" title="Governance">
            <dl className="divide-border/60 divide-y">
              <Fact label="PIP">
                {governance.open_pip ? (
                  <Badge variant="warning">Open · {governance.pip_status ?? "active"}</Badge>
                ) : (
                  <Badge variant="outline">None</Badge>
                )}
              </Fact>
              <Fact label="Idle flags">
                {governance.open_idle_flags > 0 ? (
                  <Badge variant="warning">
                    {plural(governance.open_idle_flags, "open flag", "open flags")}
                  </Badge>
                ) : (
                  <Badge variant="outline">None</Badge>
                )}
              </Fact>
              <Fact label="Absences">
                {governance.open_absences > 0 ? (
                  <Badge variant="warning">{governance.open_absences} unaddressed</Badge>
                ) : (
                  <Badge variant="outline">None</Badge>
                )}
              </Fact>
              <Fact label="Promotion">
                {governance.pending_promotion ? (
                  <Badge variant="success">Nominated</Badge>
                ) : (
                  <Badge variant="outline">None</Badge>
                )}
              </Fact>
            </dl>
          </Section>

          <Section id="team-panel-meetings" title="Meetings">
            <dl className="divide-border/60 divide-y">
              <Fact label="Last 1:1">
                {meetings.last_one_on_one_on ? (
                  formatDateDDMMYYYY(meetings.last_one_on_one_on)
                ) : (
                  <Dash />
                )}
              </Fact>
            </dl>
          </Section>
        </DialogBody>

        <DialogFooter className="justify-end">
          <Button asChild variant="outline">
            <Link to="/tl-scorecard?tab=records">
              Open records
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
