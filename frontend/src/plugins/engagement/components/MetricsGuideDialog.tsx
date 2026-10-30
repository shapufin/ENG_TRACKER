import React, { useRef } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SCORE_PARTS } from "./scoreParts";

interface MetricsGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-foreground text-sm font-semibold">{children}</h3>
);

export const MetricsGuideDialog: React.FC<MetricsGuideDialogProps> = ({ open, onOpenChange }) => {
  // Two buttons open this dialog and neither is a DialogTrigger, so Radix has no
  // trigger to give focus back to. Remember whichever one was focused.
  const opener = useRef<HTMLElement | null>(null);
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
          <DialogTitle>How engagement is measured</DialogTitle>
          <DialogDescription>
            How quickly and reliably you decide leave, overtime and standby requests.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="text-sm">
          <section className="space-y-2">
            <Heading>Engagement score (0-100)</Heading>
            <dl className="space-y-1.5">
              {SCORE_PARTS.map((part) => (
                <div key={part.label} className="flex gap-3">
                  <dt className="text-foreground w-40 shrink-0 font-medium">
                    {part.label} <span className="tabular-nums">{part.weight}%</span>
                  </dt>
                  <dd className="text-muted-foreground">{part.text}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="space-y-2">
            <Heading>Deadlines</Heading>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>
                Leave: end of the same working day it was submitted. Submitted on a weekend or
                holiday: end of the next working day.
              </li>
              <li>Overtime and standby: end of the 5th working day after submission.</li>
              <li>
                Working days are Monday to Friday, excluding public holidays, in Albanian time.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <Heading>Breaches</Heading>
            <p className="text-muted-foreground">
              A request is a breach when it was decided after its deadline, or is still pending past
              it. Deciding a pending request ends its pending count, but a decision made after the
              deadline stays a late one.
            </p>
          </section>

          <section className="space-y-2">
            <Heading>Time to approve (TTA)</Heading>
            <p className="text-muted-foreground">
              The average hours between a request being submitted and you deciding it. It appears
              under Approval Rate and as the dashed line in the trend chart. Approval aging groups
              decisions as under 4 hours, 4 to 24 hours, 1 to 3 days, and over 3 days.
            </p>
          </section>

          <section className="space-y-2">
            <Heading>Evidence only, not scored</Heading>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              <li>Dedication: requests you approved while you were on your own leave.</li>
              <li>Holiday decisions: requests you decided on a public holiday.</li>
            </ul>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
