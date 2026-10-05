import React, { useState } from "react";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  Handshake,
  History,
  Pencil,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import type {
  HbprEvidence,
  HbprEvidencePayload,
  HbprPartnership,
  YearEndEvidencePack,
} from "../../types/tlScorecard";
import {
  CADENCE_LABELS,
  CADENCE_STATUS_LABELS,
  CADENCE_STATUS_TONE,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KIND_TONE,
  formatDate,
} from "../hbpr/hbprMeta";
import { EvidencePackDialog } from "./EvidencePackDialog";
import { HbprEvidenceDialog } from "./HbprEvidenceDialog";

interface HbprPartnershipSectionProps {
  partnership: HbprPartnership | undefined;
  /** Evidence rows for this leader (already scoped by the caller). */
  evidence: HbprEvidence[];
  year: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Only the assigned Albanian TL (and staff) may author the evidence. */
  canAuthor: boolean;
  onCreate: (data: HbprEvidencePayload) => Promise<void>;
  onUpdate: (id: number, data: HbprEvidencePayload) => Promise<void>;
  /** Fetches the packaged year-end evidence summary for an assignment+year. */
  loadEvidencePack: (assignmentId: number, year: number) => Promise<YearEndEvidencePack>;
}

/**
 * The Albanian TL's HBPR partnership: who their HBPR is, the cadence state, and
 * the governance evidence they author. Read-only for anyone but the AL TL.
 */
export const HbprPartnershipSection: React.FC<HbprPartnershipSectionProps> = ({
  partnership,
  evidence,
  year,
  isLoading,
  isError,
  onRetry,
  canAuthor,
  onCreate,
  onUpdate,
  loadEvidencePack,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HbprEvidence | null>(null);
  const [packOpen, setPackOpen] = useState(false);

  const assignment = partnership?.assignment ?? null;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (row: HbprEvidence) => {
    setEditing(row);
    setDialogOpen(true);
  };
  // Mount the dialog only while open (keyed), so its fields re-seed from
  // `initial` instead of holding the values of a previously edited row.
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  return (
    <section aria-labelledby="hbpr-partnership" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="hbpr-partnership" className="text-muted-foreground text-sm font-semibold">
          HBPR partnership
        </h2>
        {assignment && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPackOpen(true)}>
              <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Evidence pack
            </Button>
            {canAuthor && (
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Record evidence
              </Button>
            )}
          </div>
        )}
      </div>

      {isError ? (
        <ErrorCard title="Could not load your HBPR partnership" onRetry={onRetry} />
      ) : isLoading ? (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only">Loading your HBPR partnership…</span>
          <div className="bg-muted/40 h-24 animate-pulse rounded-xl border" />
          <div className="bg-muted/40 h-20 animate-pulse rounded-xl border" />
        </div>
      ) : !assignment ? (
        <GlassCard animateOnMount={false} isHoverLift={false} className="p-0">
          <EmptyState
            icon={Handshake}
            title="No HR business partner assigned yet"
            description="An administrator pairs each Albanian team leader with an HR business partner. Once you are paired, your cadence and EPR evidence live here."
            className="py-10"
          />
        </GlassCard>
      ) : (
        <>
          <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">HR business partner</p>
                <p className="truncate font-semibold">{assignment.hbpr.name}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {CADENCE_LABELS[assignment.cadence]} cadence · paired since{" "}
                  {formatDate(assignment.effective_from)}
                </p>
              </div>
              <Badge variant={CADENCE_STATUS_TONE[assignment.cadence_status]}>
                {CADENCE_STATUS_LABELS[assignment.cadence_status]}
              </Badge>
            </div>

            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Last HBPR meeting</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {formatDate(assignment.last_meeting_on)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Next due</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-medium tabular-nums">
                  <CalendarClock
                    className="text-muted-foreground h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {formatDate(assignment.next_due_on)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Evidence recorded</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{assignment.evidence_count}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant={assignment.epr_mid_year ? "success" : "warning"}>
                Mid-year EPR: {assignment.epr_mid_year ? "recorded" : "missing"}
              </Badge>
              <Badge variant={assignment.epr_year_end ? "success" : "warning"}>
                Year-end EPR: {assignment.epr_year_end ? "recorded" : "missing"}
              </Badge>
            </div>
          </GlassCard>

          {evidence.length === 0 ? (
            <InfoCallout
              tone="info"
              icon={<History className="h-4 w-4" aria-hidden="true" />}
              label={`No governance evidence recorded in ${year}`}
              value={
                canAuthor
                  ? "Record your cadence meetings and EPR participation to build the evidence trail."
                  : undefined
              }
            />
          ) : (
            <ol className="space-y-3">
              {evidence.map((row) => (
                <li key={row.id}>
                  <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={EVIDENCE_KIND_TONE[row.kind]}>
                            {EVIDENCE_KIND_LABELS[row.kind]}
                          </Badge>
                          <span className="text-sm font-medium tabular-nums">
                            {formatDate(row.occurred_on)}
                          </span>
                        </div>
                        {row.reporting_year && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            Reporting {row.reporting_year}
                          </p>
                        )}
                      </div>
                      {canAuthor && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(row)}
                          aria-label={`Edit ${EVIDENCE_KIND_LABELS[row.kind]} on ${formatDate(row.occurred_on)}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Edit
                        </Button>
                      )}
                    </div>

                    {row.shared_summary && (
                      <p className="mt-3 text-sm break-words whitespace-pre-line">
                        {row.shared_summary}
                      </p>
                    )}
                    {row.action_items && (
                      <div className="border-line-subtle bg-muted/40 mt-3 rounded-lg border p-3">
                        <p className="text-muted-foreground text-xs font-medium">Action items</p>
                        <p className="mt-1 text-sm break-words whitespace-pre-line">
                          {row.action_items}
                        </p>
                      </div>
                    )}
                    {row.reference_url && (
                      <a
                        href={row.reference_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary mt-3 inline-flex min-h-6 items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Reference
                      </a>
                    )}
                  </GlassCard>
                </li>
              ))}
            </ol>
          )}

          {canAuthor && dialogOpen && (
            <HbprEvidenceDialog
              key={editing?.id ?? "create"}
              open
              onOpenChange={(open) => !open && closeDialog()}
              assignmentId={assignment.id}
              defaultYear={year}
              mode={editing ? "edit" : "create"}
              initial={editing ?? undefined}
              onSave={(data) => (editing ? onUpdate(editing.id, data) : onCreate(data))}
            />
          )}

          <EvidencePackDialog
            open={packOpen}
            onOpenChange={setPackOpen}
            load={() => loadEvidencePack(assignment.id, year)}
          />
        </>
      )}
    </section>
  );
};
