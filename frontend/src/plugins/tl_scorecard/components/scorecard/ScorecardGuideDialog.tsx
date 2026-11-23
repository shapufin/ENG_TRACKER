import React, { useRef } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ScorecardTargets } from "../../types/tlScorecard";

interface ScorecardGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: ScorecardTargets;
}

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-foreground text-sm font-semibold">{children}</h3>
);

const formatNumber = (val: number): string =>
  Number.isInteger(val) ? String(val) : String(val).replace(/\.0$/, "");

export const ScorecardGuideDialog: React.FC<ScorecardGuideDialogProps> = ({
  open,
  onOpenChange,
  targets,
}) => {
  const opener = useRef<HTMLElement | null>(null);

  const tlSyncPerYear = formatNumber(targets.tl_sync_per_year);
  const tlSyncFullYear =
    targets.tl_sync_full_year != null ? formatNumber(targets.tl_sync_full_year) : null;
  const otWithinSlaPct = formatNumber(targets.ot_within_sla_pct ?? 100);
  const oneOnOnePct = formatNumber(targets.one_on_one_pct);
  const reviewsPerYear = formatNumber(targets.reviews_per_year);
  const promotionPct = formatNumber(targets.promotion_pct);

  const managerSyncsText =
    tlSyncFullYear != null
      ? `${tlSyncPerYear} a year (every two weeks) or ${tlSyncFullYear} (weekly): either is on track. The year-to-date pace is checked against ${tlSyncPerYear}.`
      : `${tlSyncPerYear} a year. The year-to-date pace is checked against ${tlSyncPerYear}.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>How the scorecard is measured</DialogTitle>
          <DialogDescription>
            What each number counts, its target, and when a month becomes final.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="text-sm">
          <section className="space-y-2">
            <Heading>Leave</Heading>
            <p className="text-muted-foreground">
              Leave decided within 2 working days: target 100%. Pending leave at month-end: target
              0.
            </p>
          </section>

          <section className="space-y-2">
            <Heading>Overtime</Heading>
            <p className="text-muted-foreground">
              Overtime decided within 2 working days of submission: target {otWithinSlaPct}%. The
              average turnaround is shown for context and is not judged. Standby is not part of this
              target.
            </p>
          </section>

          <section className="space-y-2">
            <Heading>1-on-1s</Heading>
            <p className="text-muted-foreground">
              1-on-1 compliance: target {oneOnOnePct}%. A team member on approved leave for the
              whole month, or skipped with a reason, is excused.
            </p>
          </section>

          <section className="space-y-2">
            <Heading>Onboarding</Heading>
            <p className="text-muted-foreground">
              {
                "Onboarding 1-on-1s within 14 days: target 100%. Tick Onboarding conversation on the 1-on-1. A joiner is due 14 calendar days after their start date and counts in the month those 14 days end. A joiner who has left still counts. A month with no joiners shows —."
              }
            </p>
          </section>

          <section className="space-y-2">
            <Heading>Manager syncs</Heading>
            <p className="text-muted-foreground">{managerSyncsText}</p>
          </section>

          <section className="space-y-2">
            <Heading>Management reviews</Heading>
            <p className="text-muted-foreground">{reviewsPerYear} a year, one a month.</p>
          </section>

          <section className="space-y-2">
            <Heading>Promotion rate</Heading>
            <p className="text-muted-foreground">target {promotionPct}%.</p>
          </section>

          <section className="space-y-2">
            <Heading>Colours and status</Heading>
            <p className="text-muted-foreground">
              The cards and the Excel and PDF reports use the same bands: a value at its target is
              green (On track), from 80% of it is amber (Watch), and below that red (Off track). A
              month with nothing to judge shows a dash.
            </p>
          </section>

          <section className="space-y-2">
            <Heading>Working days</Heading>
            <p className="text-muted-foreground">
              Monday to Friday, excluding public holidays, in Albanian time.
            </p>
          </section>

          <section className="space-y-2">
            <Heading>When a month is final</Heading>
            <p className="text-muted-foreground">
              {
                "A month's numbers freeze at 00:00 on the 10th of the next month and do not change afterwards."
              }
            </p>
          </section>

          <section className="space-y-2">
            <Heading>Privacy</Heading>
            <p className="text-muted-foreground">
              Your HR Business Partner never sees 1-on-1s or onboarding results.
            </p>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
