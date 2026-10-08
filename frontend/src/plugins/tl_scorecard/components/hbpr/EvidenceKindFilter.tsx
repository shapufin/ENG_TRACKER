import React from "react";
import { Button } from "@/components/ui/button";
import type { HbprEvidenceKind } from "../../types/tlScorecard";
import { EVIDENCE_KIND_GROUP_LABELS, EVIDENCE_KIND_ORDER } from "./hbprMeta";

export type EvidenceKindValue = HbprEvidenceKind | "all";

interface EvidenceKindFilterProps {
  value: EvidenceKindValue;
  onChange: (value: EvidenceKindValue) => void;
}

/** Separates cadence meetings from the two EPR participations in the log. */
export const EvidenceKindFilter: React.FC<EvidenceKindFilterProps> = ({ value, onChange }) => (
  <div role="group" aria-label="Filter by meeting type" className="flex flex-wrap gap-2">
    {(["all", ...EVIDENCE_KIND_ORDER] as const).map((kind) => (
      <Button
        key={kind}
        type="button"
        size="sm"
        variant={value === kind ? "default" : "outline"}
        aria-pressed={value === kind}
        onClick={() => onChange(kind)}
      >
        {kind === "all" ? "All" : EVIDENCE_KIND_GROUP_LABELS[kind]}
      </Button>
    ))}
  </div>
);
