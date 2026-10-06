import React, { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { YearEndEvidencePack } from "../../types/tlScorecard";
import { CADENCE_LABELS, formatDate } from "../hbpr/hbprMeta";

interface EvidencePackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fetches the pack for the assignment+year (the section wires the service). */
  load: () => Promise<YearEndEvidencePack>;
}

type PackState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; pack: YearEndEvidencePack };

/** Fetches on mount — Radix unmounts closed dialog content, so this re-runs
 * fresh every time the dialog opens. The ref keeps `load` readable without
 * letting an inline parent's prop identity retrigger the fetch. */
const PackContent: React.FC<{ load: () => Promise<YearEndEvidencePack> }> = ({ load }) => {
  const [state, setState] = useState<PackState>({ status: "loading" });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((pack) => !cancelled && setState({ status: "ready", pack }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div aria-busy="true" className="space-y-2">
        <span className="sr-only">Loading the year-end summary…</span>
        <div className="bg-muted/40 h-16 animate-pulse rounded-lg border" />
        <div className="bg-muted/40 h-24 animate-pulse rounded-lg border" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-tone-danger-text text-sm">
        Could not load the year-end summary. Close and try again.
      </p>
    );
  }
  const pack = state.pack;
  return <PackBody pack={pack} />;
};

const EvidenceRow: React.FC<{ row: NonNullable<YearEndEvidencePack["epr_mid_year"]> }> = ({
  row,
}) => (
  <li className="border-line-subtle rounded-lg border p-3">
    <p className="text-sm font-medium tabular-nums">{formatDate(row.occurred_on)}</p>
    {row.shared_summary && (
      <p className="mt-1 text-sm break-words whitespace-pre-line">{row.shared_summary}</p>
    )}
    {row.action_items && (
      <div className="mt-1">
        <p className="text-muted-foreground text-xs font-medium">Action items</p>
        <p className="mt-0.5 text-xs break-words whitespace-pre-line">{row.action_items}</p>
      </div>
    )}
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      {row.reference_url && (
        <a
          href={row.reference_url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          Reference
        </a>
      )}
      {row.recorded_by_name && (
        <span className="text-muted-foreground text-xs">recorded by {row.recorded_by_name}</span>
      )}
    </div>
  </li>
);

const PackBody: React.FC<{ pack: YearEndEvidencePack }> = ({ pack }) => (
  <div className="space-y-4">
    <h3 className="text-sm font-semibold">{pack.year} year-end summary</h3>
    <div className="text-sm">
      <p>
        <span className="font-medium">{pack.assignment.albanian_tl_name}</span>
        <span className="text-muted-foreground"> · HR business partner: </span>
        <span className="font-medium">{pack.assignment.hbpr_name}</span>
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {CADENCE_LABELS[pack.assignment.cadence]} cadence · since{" "}
        {formatDate(pack.assignment.effective_from)}
        {pack.assignment.effective_to && ` · ended ${formatDate(pack.assignment.effective_to)}`}
      </p>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="border-line-subtle rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">Cadence meetings</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">
          {pack.cadence_held}/{pack.cadence_expected}
        </p>
      </div>
      <div className="border-line-subtle rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">Coverage</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">
          {pack.coverage_pct !== null ? `${pack.coverage_pct}%` : "—"}
        </p>
      </div>
      <div className="border-line-subtle col-span-2 rounded-lg border p-3 sm:col-span-1">
        <p className="text-muted-foreground text-xs">EPR participation</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant={pack.epr_mid_year ? "success" : "warning"}>
            {pack.epr_mid_year ? "Mid-year: logged" : "Mid-year EPR participation: not logged"}
          </Badge>
          <Badge variant={pack.epr_year_end ? "success" : "warning"}>
            {pack.epr_year_end ? "Year-end: logged" : "Year-end EPR participation: not logged"}
          </Badge>
        </div>
      </div>
    </div>

    {pack.meetings.length > 0 && (
      <div>
        <h3 className="text-micro text-muted-foreground flex items-center gap-1.5 font-mono font-semibold tracking-wider uppercase">
          Cadence meetings ({pack.meetings.length})
        </h3>
        <ul className="mt-2 space-y-2">
          {pack.meetings.map((row) => (
            <EvidenceRow key={row.id} row={row} />
          ))}
        </ul>
      </div>
    )}

    {[pack.epr_mid_year, pack.epr_year_end].some(Boolean) && (
      <div>
        <h3 className="text-micro text-muted-foreground flex items-center gap-1.5 font-mono font-semibold tracking-wider uppercase">
          EPR participation
        </h3>
        <ul className="mt-2 space-y-2">
          {[pack.epr_mid_year, pack.epr_year_end]
            .filter((r): r is NonNullable<typeof r> => r !== null)
            .map((row) => (
              <EvidenceRow key={row.id} row={row} />
            ))}
        </ul>
      </div>
    )}
  </div>
);

/**
 * The packaged per-assignment+year summary the Albanian TL hands to their
 * manager at year-end review: cadence meetings held vs expected and both EPR
 * participations. Read-only — corrections go through the evidence list.
 */
export const EvidencePackDialog: React.FC<EvidencePackDialogProps> = ({
  open,
  onOpenChange,
  load,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent size="lg" aria-describedby={undefined}>
      <DialogHeader>
        <DialogTitle>Year-end summary</DialogTitle>
        <DialogDescription>
          Held-vs-expected cadence and EPR participation for this assignment — the summary to hand
          over at year-end review.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <PackContent load={load} />
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button onClick={() => window.print()}>Print</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
