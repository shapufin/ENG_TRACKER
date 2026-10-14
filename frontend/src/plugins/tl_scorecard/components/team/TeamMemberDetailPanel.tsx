import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Mail,
  ShieldAlert,
  Target,
} from "lucide-react";
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
import {
  DetailDrawerHero,
  DetailDrawerSection,
  DetailDrawerRow,
  DetailDrawerMetricGrid,
  DetailDrawerMetricCard,
  DetailDrawerEmpty,
} from "@/components/ui/DetailDrawer";
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const formatDays = (value: string): string => {
  const days = toDays(value);
  return days === null ? "—" : `${days} d`;
};

/**
 * Modern read-only detail drawer for one team member.
 * Shared presentation and layout contract with Admin UserDetailPanel.
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
  const seniority = member.seniority_level ? SENIORITY_LABELS[member.seniority_level] : null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent side="right" size="panel">
        <DialogHeader className="pr-12">
          <DialogTitle className="sr-only">{member.full_name}</DialogTitle>
          <DetailDrawerHero
            name={member.full_name}
            subtitle={
              member.email ? (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{member.email}</span>
                </span>
              ) : undefined
            }
            badges={
              seniority ? (
                <Badge
                  variant="default"
                  className={cn(toneSurfaceClass.info, "h-5 px-1.5 py-0 text-xs font-normal")}
                >
                  {seniority}
                </Badge>
              ) : null
            }
          />
          <DialogDescription className="sr-only">
            Read-only summary for this team member.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-3">
          {/* Compensation */}
          <DetailDrawerSection
            id="team-panel-compensation"
            title="Compensation"
            icon={Banknote}
            badge={
              wageText ? (
                <Badge variant="outline" className="text-xs">
                  Active
                </Badge>
              ) : null
            }
          >
            {wageText ? (
              <div className="border-border/50 bg-background/50 rounded-xl border p-3">
                <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  Gross Monthly
                </span>
                <p className="text-foreground font-mono text-2xl font-bold tabular-nums">
                  {wageText}
                </p>
              </div>
            ) : (
              <div className="border-border/60 bg-muted/20 rounded-xl border border-dashed p-3">
                <p className="text-muted-foreground text-sm">{unavailableReason}</p>
              </div>
            )}
            <DetailDrawerRow label="Effective from">
              {wage.effective_from ? (
                formatDateDDMMYYYY(wage.effective_from)
              ) : (
                <DetailDrawerEmpty />
              )}
            </DetailDrawerRow>
            <p className="text-muted-foreground text-xs italic">
              Visible to you as this employee&apos;s team leader.
            </p>
          </DetailDrawerSection>

          {/* Time off */}
          <DetailDrawerSection
            id="team-panel-time-off"
            title={`Time off (${currentYear})`}
            icon={Calendar}
          >
            <DetailDrawerMetricGrid cols={4}>
              <DetailDrawerMetricCard label="Available" value={formatDays(leave.available_days)} />
              <DetailDrawerMetricCard label="Used" value={formatDays(leave.used_days)} />
              <DetailDrawerMetricCard label="Pending" value={formatDays(leave.pending_days)} />
              <DetailDrawerMetricCard label="Total" value={formatDays(leave.total_days)} />
            </DetailDrawerMetricGrid>

            <div className="space-y-1.5 pt-2">
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>Usage rate</span>
                <span className="font-mono font-medium">{usedPct}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Leave used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={usedPct}
                className="bg-muted/60 h-2 w-full overflow-hidden rounded-full"
              >
                <div
                  className="bg-primary h-full rounded-full transition-all duration-300"
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <span className="text-muted-foreground text-xs font-semibold">
                Approved leave ahead
              </span>
              {leave.upcoming.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">No approved leave ahead.</p>
              ) : (
                <ul className="space-y-1.5">
                  {leave.upcoming.map((item) => (
                    <li
                      key={`${item.start_date}-${item.end_date}-${item.request_type}`}
                      className="border-border/40 bg-background/50 flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs"
                    >
                      <span className="text-foreground font-medium">
                        {formatDateDDMMYYYY(item.start_date)} – {formatDateDDMMYYYY(item.end_date)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs">
                          {leaveTypeLabel(item.request_type)}
                        </Badge>
                        <span className="text-muted-foreground">
                          {plural(item.business_days, "business day", "business days")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DetailDrawerSection>

          {/* EPR */}
          <DetailDrawerSection
            id="team-panel-epr"
            title={`EPR (${epr.year})`}
            icon={Target}
            badge={
              <Badge variant="outline" className="text-xs">
                {epr.goal_count} goals
              </Badge>
            }
          >
            <ol className="space-y-2">
              {EPR_STEPS.map(({ stage, label }) => {
                const done = eprStageDone(epr, stage);
                const next = !done && epr.next_stage === stage;
                return (
                  <li
                    key={stage}
                    className="border-border/40 bg-background/50 flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {done ? (
                        <CheckCircle2
                          className={cn("h-4 w-4 shrink-0", "text-tone-success-text")}
                          aria-hidden="true"
                        />
                      ) : next ? (
                        <Circle
                          className={cn("h-4 w-4 shrink-0", "text-primary")}
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          className="text-muted-foreground/40 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span className="text-foreground font-medium">{label}</span>
                    </div>
                    <Badge
                      variant={done ? "default" : next ? "outline" : "secondary"}
                      className={cn(
                        "text-xs font-normal",
                        done
                          ? toneSurfaceClass.success
                          : next
                            ? toneSurfaceClass.info
                            : toneSurfaceClass.neutral
                      )}
                    >
                      {done ? "Done" : next ? "Next" : "Pending"}
                    </Badge>
                  </li>
                );
              })}
            </ol>
            <DetailDrawerRow label="Goals logged">{epr.goal_count}</DetailDrawerRow>
          </DetailDrawerSection>

          {/* Governance */}
          <DetailDrawerSection id="team-panel-governance" title="Governance" icon={ShieldAlert}>
            <DetailDrawerRow label="PIP">
              {governance.open_pip ? (
                <Badge variant="warning">Open · {governance.pip_status ?? "active"}</Badge>
              ) : (
                <Badge variant="outline">None</Badge>
              )}
            </DetailDrawerRow>
            <DetailDrawerRow label="Idle flags">
              {governance.open_idle_flags > 0 ? (
                <Badge variant="warning">
                  {plural(governance.open_idle_flags, "open flag", "open flags")}
                </Badge>
              ) : (
                <Badge variant="outline">None</Badge>
              )}
            </DetailDrawerRow>
            <DetailDrawerRow label="Absences">
              {governance.open_absences > 0 ? (
                <Badge variant="warning">{governance.open_absences} unaddressed</Badge>
              ) : (
                <Badge variant="outline">None</Badge>
              )}
            </DetailDrawerRow>
            <DetailDrawerRow label="Promotion">
              {governance.pending_promotion ? (
                <Badge variant="success">Nominated</Badge>
              ) : (
                <Badge variant="outline">None</Badge>
              )}
            </DetailDrawerRow>
          </DetailDrawerSection>

          {/* Meetings */}
          <DetailDrawerSection id="team-panel-meetings" title="Meetings" icon={Clock}>
            <DetailDrawerRow label="Last 1:1">
              {meetings.last_one_on_one_on ? (
                formatDateDDMMYYYY(meetings.last_one_on_one_on)
              ) : (
                <DetailDrawerEmpty />
              )}
            </DetailDrawerRow>
          </DetailDrawerSection>
        </DialogBody>

        <DialogFooter className="justify-end">
          <Button asChild variant="outline" className="min-h-11">
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
