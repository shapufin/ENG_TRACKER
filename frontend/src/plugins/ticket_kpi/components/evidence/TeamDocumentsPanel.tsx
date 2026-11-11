import React, { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { useAuth } from "@/context/AuthContext";
import { useTicketKPIEvidence } from "../../pages/hooks/useTicketKPIEvidence";
import { EvidenceList } from "./EvidenceList";
import type { EvidenceStatus, KPIEvidence } from "../../types/ticketKPI";

const EmailThreadViewer = lazy(() =>
  import("./EmailThreadViewer").then((m) => ({ default: m.EmailThreadViewer }))
);

type StatusFilter = "all" | EvidenceStatus;

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

interface TeamDocumentsPanelProps {
  month: string;
}

/** Line Manager view: every document the squad added for a month, newest first. */
export const TeamDocumentsPanel: React.FC<TeamDocumentsPanelProps> = ({ month }) => {
  const { user } = useAuth();
  const {
    evidence: allEvidence,
    isLoading,
    canReview,
    reviewMutation,
    unreviewMutation,
    deleteMutation,
  } = useTicketKPIEvidence({ month, squad: true });
  // The Line Manager's own documents are reviewed by someone else, so they stay off this list.
  const evidence = useMemo(
    () => allEvidence.filter((e) => e.user !== user?.id),
    [allEvidence, user?.id]
  );
  const [status, setStatus] = useState<StatusFilter>("all");
  const [member, setMember] = useState<string>("all");
  const [viewingEmail, setViewingEmail] = useState<KPIEvidence | null>(null);

  const members = useMemo(() => {
    const names = new Map<number, string>();
    for (const item of evidence) names.set(item.user, item.username || "Unknown");
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [evidence]);

  const inScope = useMemo(
    () => (member === "all" ? evidence : evidence.filter((e) => String(e.user) === member)),
    [evidence, member]
  );
  const visible = useMemo(
    () => (status === "all" ? inScope : inScope.filter((e) => e.status === status)),
    [inScope, status]
  );

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: inScope.length,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const item of inScope) c[item.status] += 1;
    return c;
  }, [inScope]);

  const handleReview = useCallback(
    (id: number, next: "approved" | "rejected") => reviewMutation.mutate({ id, status: next }),
    [reviewMutation]
  );
  const handleUnreview = useCallback(
    (id: number) => unreviewMutation.mutate(id),
    [unreviewMutation]
  );
  const handleDelete = useCallback((id: number) => deleteMutation.mutate(id), [deleteMutation]);
  const handleCloseEmail = useCallback(() => setViewingEmail(null), []);

  const processingId =
    (reviewMutation.isPending ? reviewMutation.variables?.id : undefined) ??
    (unreviewMutation.isPending ? unreviewMutation.variables : undefined) ??
    (deleteMutation.isPending ? deleteMutation.variables : undefined);

  if (!isLoading && evidence.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents from your team this month."
        description="Documents your team members add on their Ticket KPI page appear here for review."
      />
    );
  }

  return (
    <GlassCard>
      <CardHeader>
        <CardTitle>Team Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterChipRow<StatusFilter>
          label="Status"
          selected={[status]}
          onToggle={setStatus}
          options={(Object.keys(STATUS_LABELS) as StatusFilter[]).map((value) => ({
            value,
            label: STATUS_LABELS[value],
            count: counts[value],
          }))}
        />
        {members.length > 1 && (
          <FilterChipRow<string>
            label="Member"
            selected={[member]}
            onToggle={setMember}
            options={[
              { value: "all", label: "Everyone" },
              ...members.map(([id, name]) => ({ value: String(id), label: name })),
            ]}
          />
        )}
        <EvidenceList
          evidence={visible}
          isLoading={isLoading}
          canReview={canReview}
          processingId={processingId}
          onReview={handleReview}
          onUnreview={handleUnreview}
          onDelete={handleDelete}
          onViewEmail={setViewingEmail}
        />
      </CardContent>
      <Suspense fallback={null}>
        <EmailThreadViewer
          open={!!viewingEmail}
          onOpenChange={handleCloseEmail}
          email={viewingEmail?.parsed_email}
        />
      </Suspense>
    </GlassCard>
  );
};
