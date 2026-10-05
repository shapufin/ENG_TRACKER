import React from "react";
import {
  Award,
  CheckCircle2,
  ClipboardList,
  Handshake,
  PhoneCall,
  Plus,
  ShieldAlert,
  UserMinus,
  UsersRound,
  UserX,
} from "lucide-react";
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
import type {
  CompleteEprStagePayload,
  EPRCycle,
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
  onAddGoal: (cycleId: number, description: string) => Promise<void>;
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
  onAddGoal,
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
      <section aria-labelledby="tl-communication">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tl-communication" className={SECTION_HEADING}>
            Communication
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onLogMeeting}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Log meeting
            </Button>
            <Button variant="default" size="sm" onClick={onLogReview}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Log review
            </Button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <section aria-labelledby="tl-idle">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tl-idle" className={SECTION_HEADING}>
            Idle Management
          </h2>
          <Button variant="outline" size="sm" onClick={onFlagIdle}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Flag idle risk
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>

      <section aria-labelledby="tl-governance-risk">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tl-governance-risk" className={SECTION_HEADING}>
            Governance &amp; Risk
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onFlagAbsence}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Flag absence
            </Button>
            <Button variant="outline" size="sm" onClick={onNominatePromotion}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Nominate promotion
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenPip}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Open PIP
            </Button>
            <Button variant="outline" size="sm" onClick={onStartEprCycle}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Start EPR cycle
            </Button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {escalations && (
          <div className="mt-4">
            <EscalationsPanel candidates={escalations} />
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              onAddGoal={onAddGoal}
              onCompleteStage={onCompleteStage}
            />
          )}
        </div>
      </section>
    </>
  );
};
