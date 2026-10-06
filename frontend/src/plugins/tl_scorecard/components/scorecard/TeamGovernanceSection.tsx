import React from "react";
import {
  Activity,
  Award,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Handshake,
  PhoneCall,
  Plus,
  ShieldAlert,
  UserMinus,
  UsersRound,
  UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/StatCard";
import { toneSurfaceClass, toneTextClass } from "@/components/ui/tone";
import { EPRSection } from "../EPRSection";
import { EscalationsPanel } from "../EscalationsPanel";
import { PIPListPanel } from "../PIPListPanel";
import { slaTone, slaWell } from "./scorecardMeta";

/** Uppercase micro-label shared by every scorecard metric card. */
const MICRO_LABEL = "font-semibold uppercase tracking-wider";

/** Section heading style for the scorecard workspace. */
const SECTION_HEADING = "text-foreground text-base font-bold tracking-tight";

const STAT_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";
const SUB_HEADING = `text-muted-foreground text-xs ${MICRO_LABEL}`;

/** Module header: icon well + title/description, actions wrap beneath on narrow screens. */
const ModuleHeader: React.FC<{
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}> = ({ id, icon: Icon, title, description, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneSurfaceClass.info}`}
      >
        <Icon className={`h-5 w-5 ${toneTextClass.info}`} aria-hidden="true" />
      </div>
      <div>
        <h2 id={id} className={SECTION_HEADING}>
          {title}
        </h2>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);
import type {
  CompleteEprStagePayload,
  EPRCycle,
  EPRStage,
  EscalationCandidate,
  PIPRecord,
  Scorecard,
} from "../../types/tlScorecard";

interface TeamGovernanceSectionProps {
  scorecard: Scorecard;
  escalations: EscalationCandidate[] | undefined;
  pipRecords: PIPRecord[] | undefined;
  eprCycles: EPRCycle[] | undefined;
  canApprovePip: boolean;
  isApprovingPip: boolean;
  onApprovePip: (id: number) => void;
  onParseGoals: (cycleId: number, stage: EPRStage, file: File) => Promise<string[]>;
  onCompleteStage: (cycleId: number, data: CompleteEprStagePayload) => Promise<void>;
  onLogMeeting: () => void;
  onLogReview: () => void;
  onFlagIdle: () => void;
  onFlagAbsence: () => void;
  onNominatePromotion: () => void;
  onOpenPip: () => void;
  onStartEprCycle: () => void;
}

/**
 * The team-level governance the Albanian TL owns: communication cadence, idle
 * risk, and the governance/risk records (absence, PIP, promotion, EPR).
 * Employee one-on-ones and employee EPR stay TL-authorable here — the HBPR
 * never sees them.
 */
export const TeamGovernanceSection: React.FC<TeamGovernanceSectionProps> = ({
  scorecard,
  escalations,
  pipRecords,
  eprCycles,
  canApprovePip,
  isApprovingPip,
  onApprovePip,
  onParseGoals,
  onCompleteStage,
  onLogMeeting,
  onLogReview,
  onFlagIdle,
  onFlagAbsence,
  onNominatePromotion,
  onOpenPip,
  onStartEprCycle,
}) => {
  const { meetings, idle, absences, pip, promotion } = scorecard;
  return (
    <>
      <section aria-labelledby="tl-cadence" className="space-y-4">
        <ModuleHeader
          id="tl-cadence"
          icon={PhoneCall}
          title="Cadence & Team Syncs"
          description="One-on-ones, syncs and management reviews"
        >
          <Button variant="outline" size="sm" onClick={onLogMeeting}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Log meeting
          </Button>
          <Button variant="default" size="sm" onClick={onLogReview}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Log review
          </Button>
        </ModuleHeader>
        <div className={STAT_GRID}>
          <StatCard
            label="1-on-1 compliance"
            labelClassName={MICRO_LABEL}
            value={
              meetings.one_on_one_compliance_pct !== null
                ? `${meetings.one_on_one_compliance_pct}%`
                : "—"
            }
            icon={Handshake}
            iconWellClass={slaWell(meetings.one_on_one_compliance_pct)}
            iconColorClass={slaTone(meetings.one_on_one_compliance_pct) ?? toneTextClass.neutral}
            valueColorClass={slaTone(meetings.one_on_one_compliance_pct)}
            trend="Target: 100%"
            progressPercent={meetings.one_on_one_compliance_pct ?? undefined}
          />
          <StatCard
            label="TL-Italy syncs"
            labelClassName={MICRO_LABEL}
            value={meetings.tl_sync_count}
            icon={PhoneCall}
            iconWellClass={`border ${toneSurfaceClass.info}`}
            iconColorClass={toneTextClass.info}
            trend="This month · target ≥45/year"
          />
          <StatCard
            label="Team meetings with HRBP"
            labelClassName={MICRO_LABEL}
            value={`${meetings.team_meetings_with_hrbp}/${meetings.team_meetings_held}`}
            icon={UsersRound}
            iconWellClass={`border ${toneSurfaceClass.accent}`}
            iconColorClass={toneTextClass.accent}
            trend={`${meetings.team_meeting_notes_within_24h} notes sent within 24h`}
          />
          <StatCard
            label="Management reviews (YTD)"
            labelClassName={MICRO_LABEL}
            value={scorecard.review_deliveries_ytd}
            icon={ClipboardList}
            iconWellClass={`border ${toneSurfaceClass.info}`}
            iconColorClass={toneTextClass.info}
            trend="Target: ≥12/year"
          />
        </div>
      </section>

      <section aria-labelledby="tl-risk-radar" className="space-y-4">
        <ModuleHeader
          id="tl-risk-radar"
          icon={Activity}
          title="Risk & Flagging Radar"
          description="Idle risk, absences, promotions and escalations"
        >
          <Button variant="outline" size="sm" onClick={onFlagIdle}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Flag idle risk
          </Button>
          <Button variant="outline" size="sm" onClick={onFlagAbsence}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Flag absence
          </Button>
          <Button variant="outline" size="sm" onClick={onNominatePromotion}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Nominate promotion
          </Button>
        </ModuleHeader>
        <p className={SUB_HEADING}>Idle management</p>
        <div className={STAT_GRID}>
          <StatCard
            label="Open idle flags"
            labelClassName={MICRO_LABEL}
            value={idle.open_count}
            icon={UserX}
            iconWellClass={
              idle.open_count === 0
                ? `border ${toneSurfaceClass.success}`
                : `border ${toneSurfaceClass.warning}`
            }
            iconColorClass={idle.open_count === 0 ? toneTextClass.success : toneTextClass.warning}
            valueColorClass={idle.open_count === 0 ? toneTextClass.success : toneTextClass.warning}
          />
          <StatCard
            label="Resolved idle flags"
            labelClassName={MICRO_LABEL}
            value={idle.resolved_count}
            icon={CheckCircle2}
            iconWellClass={`border ${toneSurfaceClass.success}`}
            iconColorClass={toneTextClass.success}
          />
        </div>
        <p className={SUB_HEADING}>Governance &amp; risk</p>
        <div className={STAT_GRID}>
          <StatCard
            label="Absences unaddressed >5 days"
            labelClassName={MICRO_LABEL}
            value={absences.breached_5_day_sla}
            icon={UserMinus}
            iconWellClass={
              absences.breached_5_day_sla === 0
                ? `border ${toneSurfaceClass.success}`
                : `border ${toneSurfaceClass.danger}`
            }
            iconColorClass={
              absences.breached_5_day_sla === 0 ? toneTextClass.success : toneTextClass.danger
            }
            valueColorClass={
              absences.breached_5_day_sla === 0 ? toneTextClass.success : toneTextClass.danger
            }
            trend={`${absences.open_count} open total`}
          />
          <StatCard
            label="PIPs pending HR approval"
            labelClassName={MICRO_LABEL}
            value={pip.pending_approval_count}
            icon={ShieldAlert}
            iconWellClass={
              pip.pending_approval_count === 0
                ? `border ${toneSurfaceClass.success}`
                : `border ${toneSurfaceClass.warning}`
            }
            iconColorClass={
              pip.pending_approval_count === 0 ? toneTextClass.success : toneTextClass.warning
            }
            valueColorClass={
              pip.pending_approval_count === 0 ? toneTextClass.success : toneTextClass.warning
            }
            trend={`${pip.active_count} active`}
          />
          <StatCard
            label="Promotion ratio"
            labelClassName={MICRO_LABEL}
            value={promotion.promoted_pct !== null ? `${promotion.promoted_pct}%` : "—"}
            icon={Award}
            iconWellClass={`border ${toneSurfaceClass.accent}`}
            iconColorClass={toneTextClass.accent}
            trend={`Target: ${promotion.target_pct}%/year · ${promotion.promoted_count} promoted`}
            progressPercent={promotion.promoted_pct ?? undefined}
          />
          <StatCard
            label="Escalation risks"
            labelClassName={MICRO_LABEL}
            value={escalations?.length ?? scorecard.escalation_count}
            icon={ShieldAlert}
            iconWellClass={
              (escalations?.length ?? scorecard.escalation_count) === 0
                ? `border ${toneSurfaceClass.success}`
                : `border ${toneSurfaceClass.danger}`
            }
            iconColorClass={
              (escalations?.length ?? scorecard.escalation_count) === 0
                ? toneTextClass.success
                : toneTextClass.danger
            }
            valueColorClass={
              (escalations?.length ?? scorecard.escalation_count) === 0
                ? toneTextClass.success
                : toneTextClass.danger
            }
            trend="Target: 0"
          />
        </div>
      </section>

      <section aria-labelledby="tl-action-queues" className="space-y-4">
        <ModuleHeader
          id="tl-action-queues"
          icon={Inbox}
          title="Action Queues"
          description="Escalations, performance plans and EPR cycles awaiting action"
        >
          <Button variant="outline" size="sm" onClick={onOpenPip}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Open PIP
          </Button>
          <Button variant="outline" size="sm" onClick={onStartEprCycle}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Start EPR cycle
          </Button>
        </ModuleHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {escalations && (
            <div className="sm:col-span-2">
              <EscalationsPanel candidates={escalations} />
            </div>
          )}
          {pipRecords && (
            <PIPListPanel
              records={pipRecords}
              canApprove={canApprovePip}
              isApproving={isApprovingPip}
              onApprove={onApprovePip}
            />
          )}
          {eprCycles && (
            <EPRSection
              cycles={eprCycles}
              onParseGoals={onParseGoals}
              onCompleteStage={onCompleteStage}
            />
          )}
        </div>
      </section>
    </>
  );
};
