import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HbprEvidenceKind } from "../../types/tlScorecard";
import {
  EVIDENCE_KIND_GROUP_LABELS,
  EVIDENCE_KIND_ORDER,
  EVIDENCE_KIND_TONE,
} from "../hbpr/hbprMeta";

/** More rows than this in one group collapse behind "Show all". */
const COLLAPSED_ROWS = 6;

interface EvidenceLike {
  id: number;
  kind: HbprEvidenceKind;
  occurred_on: string;
}

interface GroupedEvidenceListProps<T extends EvidenceLike> {
  rows: T[];
  renderRow: (row: T) => React.ReactNode;
}

const Group = <T extends EvidenceLike>({
  kind,
  rows,
  renderRow,
}: {
  kind: HbprEvidenceKind;
  rows: T[];
  renderRow: (row: T) => React.ReactNode;
}) => {
  const [expanded, setExpanded] = useState(false);
  const headingId = `evidence-group-${kind}`;
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 id={headingId} className="text-sm font-semibold">
          {EVIDENCE_KIND_GROUP_LABELS[kind]}
        </h3>
        <Badge variant={EVIDENCE_KIND_TONE[kind]} className="tabular-nums">
          {rows.length}
        </Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing logged yet</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((row) => (
            <li key={row.id}>{renderRow(row)}</li>
          ))}
        </ul>
      )}
      {rows.length > COLLAPSED_ROWS && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      )}
    </section>
  );
};

/**
 * One section per meeting type (cadence, mid-year EPR, year-end EPR), newest
 * first, so a year of evidence reads as three short lists instead of one long
 * interleaved one. Presentation only: the caller owns the row body.
 */
export const GroupedEvidenceList = <T extends EvidenceLike>({
  rows,
  renderRow,
}: GroupedEvidenceListProps<T>) => (
  <div className="space-y-6">
    {EVIDENCE_KIND_ORDER.map((kind) => (
      <Group
        key={kind}
        kind={kind}
        renderRow={renderRow}
        rows={rows
          .filter((row) => row.kind === kind)
          .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))}
      />
    ))}
  </div>
);
