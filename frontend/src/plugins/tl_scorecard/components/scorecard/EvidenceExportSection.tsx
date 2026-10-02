import React from "react";
import { FileSpreadsheet } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { ExportButton } from "../ExportButton";
import { KpiCoveragePanel } from "../KpiCoveragePanel";
import type { KpiCoverageEntry } from "../../types/tlScorecard";

interface EvidenceExportSectionProps {
  coverage: KpiCoverageEntry[] | undefined;
  leaderId?: number;
  /** ISO date inside the month to export; defaults to the current month. */
  month?: string;
}

/**
 * Focused export surface: the workbook is the evidence package the AL TL hands
 * to their manager, so it gets its own section rather than a stray button.
 */
export const EvidenceExportSection: React.FC<EvidenceExportSectionProps> = ({
  coverage,
  leaderId,
  month,
}) => (
  <section aria-labelledby="tl-evidence-export" className="space-y-3">
    <h2 id="tl-evidence-export" className="text-muted-foreground text-sm font-semibold">
      Evidence export
    </h2>
    <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <FileSpreadsheet className="text-primary/50 h-4 w-4" aria-hidden="true" />
            Governance evidence workbook
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Scorecard metrics, governance records and the HBPR↔Albanian-TL evidence sheet for this
            month. Employee one-on-one content is never included.
          </p>
        </div>
        <ExportButton leaderId={leaderId} month={month} />
      </div>
    </GlassCard>
    {coverage && <KpiCoveragePanel entries={coverage} />}
  </section>
);
