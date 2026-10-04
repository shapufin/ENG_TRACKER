import React, { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { usePermissions } from "@/context/PermissionContext";
import { EvidenceExportSection } from "../components/scorecard/EvidenceExportSection";
import { HbprPartnershipSection } from "../components/scorecard/HbprPartnershipSection";
import { ScorecardOverview } from "../components/scorecard/ScorecardOverview";
import { TeamGovernanceSection } from "../components/scorecard/TeamGovernanceSection";
import { TLScorecardHeader, type TLScorecardTab } from "../components/scorecard/TLScorecardHeader";
import { FlagAbsenceDialog } from "../components/FlagAbsenceDialog";
import { FlagIdleDialog } from "../components/FlagIdleDialog";
import { LogMeetingDialog } from "../components/LogMeetingDialog";
import { LogReviewDeliveryDialog } from "../components/LogReviewDeliveryDialog";
import { NominatePromotionDialog } from "../components/NominatePromotionDialog";
import { OpenPIPDialog } from "../components/OpenPIPDialog";
import { errorMessage } from "../components/records/errorMessage";
import { RecordsTab } from "../components/records/RecordsTab";
import { StartEPRCycleDialog } from "../components/StartEPRCycleDialog";
import { evidenceForYear } from "../hooks/useHbprWorkspaceQueries";
import { tlScorecardService } from "../services/tlScorecardService";
import type { EPRStage, HbprEvidencePayload } from "../types/tlScorecard";

const Skeleton: React.FC = () => (
  <div aria-busy="true" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <span className="sr-only">Loading your scorecard…</span>
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="bg-muted/40 h-24 animate-pulse rounded-lg border" />
    ))}
  </div>
);

const notifyError = (error: unknown) => toast.error(errorMessage(error));

/**
 * The Albanian TL's authoring workspace. Owns URL state and queries only — the
 * sections are `components/scorecard/*`.
 */
const TLScorecardAuthoring: React.FC = () => {
  const queryClient = useQueryClient();
  const { isAdmin, isSuperuser, isTeamLeader } = usePermissions();
  // The API gates PIP approve/reject, promotion decide and evidence authoring on
  // `is_staff or is_superuser`; `isAdmin` is `is_staff` only.
  const isStaff = isAdmin || isSuperuser;
  const [params, setParams] = useSearchParams();
  const tab: TLScorecardTab = params.get("tab") === "records" ? "records" : "overview";
  const year = new Date().getFullYear();

  const setTab = (next: TLScorecardTab) =>
    setParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "records") params.set("tab", "records");
        else params.delete("tab");
        return params;
      },
      { replace: true }
    );

  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [idleDialogOpen, setIdleDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [pipDialogOpen, setPipDialogOpen] = useState(false);
  const [eprDialogOpen, setEprDialogOpen] = useState(false);

  const invalidateScorecard = () =>
    queryClient.invalidateQueries({ queryKey: ["tl-scorecard", "scorecard"] });
  const invalidatePips = () =>
    queryClient.invalidateQueries({ queryKey: ["tl-scorecard", "pip-records"] });
  const invalidateEprCycles = () =>
    queryClient.invalidateQueries({ queryKey: ["tl-scorecard", "epr-cycles"] });
  const invalidatePartnership = () => {
    queryClient.invalidateQueries({ queryKey: ["tl-scorecard", "partnership"] });
    queryClient.invalidateQueries({ queryKey: ["tl-scorecard", "hbpr-evidence"] });
    queryClient.invalidateQueries({ queryKey: ["tl-scorecard", "hbpr-overview"] });
  };

  const createMeetingMutation = useMutation({
    mutationFn: tlScorecardService.createMeeting,
    onSuccess: invalidateScorecard,
    onError: notifyError,
  });
  const createIdleFlagMutation = useMutation({
    mutationFn: tlScorecardService.createIdleFlag,
    onSuccess: invalidateScorecard,
    onError: notifyError,
  });
  const createReviewDeliveryMutation = useMutation({
    mutationFn: tlScorecardService.createReviewDelivery,
    onSuccess: invalidateScorecard,
    onError: notifyError,
  });
  const createAbsenceMutation = useMutation({
    mutationFn: tlScorecardService.createAbsence,
    onSuccess: invalidateScorecard,
    onError: notifyError,
  });
  const createPromotionFlagMutation = useMutation({
    mutationFn: tlScorecardService.createPromotionFlag,
    onSuccess: invalidateScorecard,
    onError: notifyError,
  });
  const createPIPMutation = useMutation({
    mutationFn: tlScorecardService.createPIPRecord,
    onSuccess: () => {
      invalidateScorecard();
      invalidatePips();
    },
    onError: notifyError,
  });
  const approvePIPMutation = useMutation({
    mutationFn: tlScorecardService.approvePIPRecord,
    onSuccess: () => {
      invalidateScorecard();
      invalidatePips();
    },
    onError: notifyError,
  });
  const createEPRCycleMutation = useMutation({
    mutationFn: tlScorecardService.createEPRCycle,
    onSuccess: invalidateEprCycles,
    onError: notifyError,
  });
  const addEPRGoalMutation = useMutation({
    mutationFn: tlScorecardService.createEPRGoal,
    onSuccess: invalidateEprCycles,
    onError: notifyError,
  });
  const completeEPRStageMutation = useMutation({
    mutationFn: ({ cycleId, stage }: { cycleId: number; stage: EPRStage }) =>
      tlScorecardService.completeEPRStage(cycleId, `${stage}_completed_at`),
    onSuccess: invalidateEprCycles,
    onError: notifyError,
  });

  const createEvidenceMutation = useMutation({
    mutationFn: tlScorecardService.createHbprEvidence,
    onSuccess: invalidatePartnership,
    onError: notifyError,
  });
  const updateEvidenceMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: HbprEvidencePayload }) =>
      tlScorecardService.updateHbprEvidence(id, data),
    onSuccess: invalidatePartnership,
    onError: notifyError,
  });

  const scorecardQuery = useQuery({
    queryKey: ["tl-scorecard", "scorecard", "self"],
    queryFn: async () => (await tlScorecardService.getScorecard()).data,
  });
  const coverageQuery = useQuery({
    queryKey: ["tl-scorecard", "kpi-coverage"],
    queryFn: async () => (await tlScorecardService.getKpiCoverage()).data,
  });
  const engagementQuery = useQuery({
    queryKey: ["tl-scorecard", "engagement-summary"],
    queryFn: async () => (await tlScorecardService.getApprovalEngagementScore()).data,
  });
  const surveyQuery = useQuery({
    queryKey: ["tl-scorecard", "engagement-survey-average"],
    queryFn: async () => (await tlScorecardService.getEngagementSurveyTeamAverage()).data,
  });
  const escalationsQuery = useQuery({
    queryKey: ["tl-scorecard", "escalations", "self"],
    queryFn: async () => (await tlScorecardService.getEscalations()).data,
  });
  const pipRecordsQuery = useQuery({
    queryKey: ["tl-scorecard", "pip-records"],
    queryFn: () => tlScorecardService.listPIPRecords(),
  });
  const eprCyclesQuery = useQuery({
    queryKey: ["tl-scorecard", "epr-cycles"],
    queryFn: () => tlScorecardService.listEPRCycles(),
  });
  const partnershipQuery = useQuery({
    queryKey: ["tl-scorecard", "partnership", year],
    queryFn: async () => (await tlScorecardService.getPartnership(undefined, year)).data,
  });
  // Fetched without the API `year` filter: a cadence meeting has no reporting
  // year, so a server-side year filter would silently drop it.
  const evidenceQuery = useQuery({
    queryKey: ["tl-scorecard", "hbpr-evidence"],
    queryFn: () => tlScorecardService.listHbprEvidence(),
    enabled: Boolean(partnershipQuery.data?.assignment),
  });

  if (tab === "records") {
    return (
      <TLScorecardHeader
        subtitle="Historical activity log, compliance benchmarks, and employee touchpoints recorded by team leaders."
        tab={tab}
        onTabChange={setTab}
      >
        <RecordsTab />
      </TLScorecardHeader>
    );
  }

  if (scorecardQuery.isLoading) {
    return (
      <TLScorecardHeader tab={tab} onTabChange={setTab}>
        <Skeleton />
      </TLScorecardHeader>
    );
  }

  if (scorecardQuery.isError || !scorecardQuery.data) {
    return (
      <TLScorecardHeader tab={tab} onTabChange={setTab}>
        <ErrorCard
          title="Couldn't load your scorecard"
          message="Check your connection and try again."
          onRetry={() => scorecardQuery.refetch()}
        />
      </TLScorecardHeader>
    );
  }

  const scorecard = scorecardQuery.data;
  const monthLabel = new Date(`${scorecard.month}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const assignment = partnershipQuery.data?.assignment ?? null;
  const partnershipEvidence = evidenceForYear(evidenceQuery.data ?? [], year).filter(
    (row) => row.assignment === assignment?.id
  );

  return (
    <TLScorecardHeader
      subtitle={`${monthLabel} · ${scorecard.team_size} team member(s)`}
      tab={tab}
      onTabChange={setTab}
    >
      <ScorecardOverview
        scorecard={scorecard}
        engagement={engagementQuery.data}
        survey={surveyQuery.data}
      />

      <TeamGovernanceSection
        scorecard={scorecard}
        escalations={escalationsQuery.data}
        pipRecords={pipRecordsQuery.data}
        eprCycles={eprCyclesQuery.data}
        canApprovePip={isStaff}
        isApprovingPip={approvePIPMutation.isPending}
        onApprovePip={(id) => approvePIPMutation.mutate(id)}
        onAddGoal={async (cycleId, description) => {
          await addEPRGoalMutation.mutateAsync({ cycle: cycleId, description });
        }}
        onCompleteStage={async (cycleId, stage) => {
          await completeEPRStageMutation.mutateAsync({ cycleId, stage });
        }}
        onLogMeeting={() => setMeetingDialogOpen(true)}
        onLogReview={() => setReviewDialogOpen(true)}
        onFlagIdle={() => setIdleDialogOpen(true)}
        onFlagAbsence={() => setAbsenceDialogOpen(true)}
        onNominatePromotion={() => setPromotionDialogOpen(true)}
        onOpenPip={() => setPipDialogOpen(true)}
        onStartEprCycle={() => setEprDialogOpen(true)}
      />

      <HbprPartnershipSection
        partnership={partnershipQuery.data}
        evidence={partnershipEvidence}
        year={year}
        isLoading={partnershipQuery.isLoading}
        isError={partnershipQuery.isError}
        onRetry={() => void partnershipQuery.refetch()}
        canAuthor={isTeamLeader || isStaff}
        onCreate={async (data) => {
          await createEvidenceMutation.mutateAsync(data);
        }}
        onUpdate={async (id, data) => {
          await updateEvidenceMutation.mutateAsync({ id, data });
        }}
      />

      <EvidenceExportSection coverage={coverageQuery.data} month={scorecard.month} />

      <LogMeetingDialog
        open={meetingDialogOpen}
        onOpenChange={setMeetingDialogOpen}
        onCreate={async (data) => {
          await createMeetingMutation.mutateAsync(data);
        }}
      />
      <FlagIdleDialog
        open={idleDialogOpen}
        onOpenChange={setIdleDialogOpen}
        onCreate={async (data) => {
          await createIdleFlagMutation.mutateAsync(data);
        }}
      />
      <LogReviewDeliveryDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        onCreate={async (data) => {
          await createReviewDeliveryMutation.mutateAsync(data);
        }}
      />
      <FlagAbsenceDialog
        open={absenceDialogOpen}
        onOpenChange={setAbsenceDialogOpen}
        onCreate={async (data) => {
          await createAbsenceMutation.mutateAsync(data);
        }}
      />
      <NominatePromotionDialog
        open={promotionDialogOpen}
        onOpenChange={setPromotionDialogOpen}
        onCreate={async (data) => {
          await createPromotionFlagMutation.mutateAsync(data);
        }}
      />
      <OpenPIPDialog
        open={pipDialogOpen}
        onOpenChange={setPipDialogOpen}
        onCreate={async (data) => {
          await createPIPMutation.mutateAsync(data);
        }}
      />
      <StartEPRCycleDialog
        open={eprDialogOpen}
        onOpenChange={setEprDialogOpen}
        onCreate={async (data) => {
          await createEPRCycleMutation.mutateAsync(data);
        }}
      />
    </TLScorecardHeader>
  );
};

/**
 * An HBPR-only user gets their own read-only `/hbpr` workspace. The check lives
 * here, not inside the authoring component, so none of its queries fire for a
 * viewer the API would refuse anyway.
 */
export const TLScorecardPage: React.FC = () => {
  const { isHBPROnly } = usePermissions();
  if (isHBPROnly) return <Navigate to="/hbpr" replace />;
  return <TLScorecardAuthoring />;
};
