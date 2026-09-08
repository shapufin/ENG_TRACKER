import React, { useMemo } from "react";
import { EvidenceItem } from "./EvidenceItem";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EvidenceType, KPIEvidence } from "../../types/ticketKPI";

type FilterType = "all" | EvidenceType;

interface EvidenceListProps {
  evidence: KPIEvidence[];
  isLoading: boolean;
  canReview: boolean;
  processingId?: number;
  onReview: (id: number, status: "approved" | "rejected") => void;
  onUnreview: (id: number) => void;
  onDelete: (id: number) => void;
  onViewEmail: (item: KPIEvidence) => void;
}

const FILTER_ORDER: FilterType[] = [
  "all",
  "document",
  "certificate",
  "email_thread",
  "screenshot",
  "other",
];

const FILTER_LABELS: Record<FilterType, string> = {
  all: "All",
  document: "Documents",
  certificate: "Certificates",
  email_thread: "Emails",
  screenshot: "Screenshots",
  other: "Other",
};

export const EvidenceList: React.FC<EvidenceListProps> = ({
  evidence,
  isLoading,
  canReview,
  processingId,
  onReview,
  onUnreview,
  onDelete,
  onViewEmail,
}) => {
  const [filter, setFilter] = React.useState<FilterType>("all");

  // Only show filter tabs for types that actually exist in the evidence list.
  const availableFilters = useMemo<FilterType[]>(() => {
    const present = new Set<EvidenceType>();
    for (const item of evidence) present.add(item.evidence_type);
    return FILTER_ORDER.filter((f) => f === "all" || present.has(f));
  }, [evidence]);

  const filteredEvidence = useMemo(
    () => (filter === "all" ? evidence : evidence.filter((e) => e.evidence_type === filter)),
    [evidence, filter]
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading evidence...</p>;
  if (evidence.length === 0)
    return <p className="text-sm text-muted-foreground">No evidence uploaded for this month.</p>;

  return (
    <div className="space-y-3">
      {availableFilters.length > 2 && (
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <TabsList className="flex-wrap">
            {availableFilters.map((f) => (
              <TabsTrigger key={f} value={f}>
                {FILTER_LABELS[f]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {filteredEvidence.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {FILTER_LABELS[filter].toLowerCase()} evidence for this month.
        </p>
      ) : (
        filteredEvidence.map((item) => (
          <EvidenceItem
            key={item.id}
            item={item}
            canReview={canReview}
            processingId={processingId}
            onReview={onReview}
            onUnreview={onUnreview}
            onDelete={onDelete}
            onViewEmail={onViewEmail}
          />
        ))
      )}
    </div>
  );
};
