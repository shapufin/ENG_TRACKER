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
import { toneTextClass } from "@/components/ui/tone";
import { EPRSection } from "../EPRSection";
import { EscalationsPanel } from "../EscalationsPanel";
import { PIPListPanel } from "../PIPListPanel";
import { slaTone } from "./scorecardMeta";
import type {
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
  onAddGoal: (cycleId: number, description: string) => Promise<void>;
  onCompleteStage: (cycleId: number, stage: EPRStage) => Promise<void>;
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
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-sm font-semibold">Communication</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onLogMeeting}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Log meeting
            </Button>
            <Button variant="outline" size="sm" onClick={onLogReview}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Log review
            </Button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="1-on-1 compliance"
            value={
              meetings.one_on_one_compliance_pct !== null
                ? `${meetings.one_on_one_compliance_pct}%`
                : "—"
            }
            icon={Handshake}
            valueColorClass={slaTone(meetings.one_on_one_compliance_pct)}
            trend="Target: 100%"
            progressPercent={meetings.one_on_one_compliance_pct ?? undefined}
          />
          <StatCard
            label="TL-Italy syncs"
            value={meetings.tl_sync_count}
            icon={PhoneCall}
            trend="This month · target ≥45/year"
          />
          <StatCard
            label="Team meetings with HRBP"
            value={`${meetings.team_meetings_with_hrbp}/${meetings.team_meetings_held}`}
            icon={UsersRound}
            trend={`${meetings.team_meeting_notes_within_24h} notes sent within 24h`}
          />
          <StatCard
            label="Management reviews (YTD)"
            value={scorecard.review_deliveries_ytd}
            icon={ClipboardList}
            trend="Target: ≥12/year"
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-sm font-semibold">Idle Management</h2>
          <Button variant="outline" size="sm" onClick={onFlagIdle}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Flag idle risk
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Open idle flags"
            value={idle.open_count}
            icon={UserX}
            valueColorClass={idle.open_count === 0 ? toneTextClass.success : toneTextClass.warning}
          />
          <StatCard label="Resolved idle flags" value={idle.resolved_count} icon={CheckCircle2} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-sm font-semibold">Governance & Risk</h2>
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
        <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Absences unaddressed >5 days"
            value={absences.breached_5_day_sla}
            icon={UserMinus}
            valueColorClass={
              absences.breached_5_day_sla === 0 ? toneTextClass.success : toneTextClass.danger
            }
            trend={`${absences.open_count} open total`}
          />
          <StatCard
            label="PIPs pending HR approval"
            value={pip.pending_approval_count}
            icon={ShieldAlert}
            valueColorClass={
              pip.pending_approval_count === 0 ? toneTextClass.success : toneTextClass.warning
            }
            trend={`${pip.active_count} active`}
          />
          <StatCard
            label="Promotion ratio"
            value={promotion.promoted_pct !== null ? `${promotion.promoted_pct}%` : "—"}
            icon={Award}
            trend={`Target: ${promotion.target_pct}%/year · ${promotion.promoted_count} promoted`}
            progressPercent={promotion.promoted_pct ?? undefined}
          />
          <StatCard
            label="Escalation risks"
            value={escalations?.length ?? scorecard.escalation_count}
            icon={ShieldAlert}
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
