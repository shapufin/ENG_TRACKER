import { Ban, CheckCircle2, CircleDot, Clock, type LucideIcon } from "lucide-react";
import type { Tone } from "@/components/ui/tone";
import type { HbprRecordResource } from "../../hooks/useHbprWorkspaceQueries";
import { workingDaysOpen } from "../records/recordKinds";

export interface HbprRecordBadge {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

const humanize = (status: string) =>
  status.replace(/_/g, " ").replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

/**
 * Tone + icon + label for an HBPR explorer row, mirroring the TL tab's
 * `recordKinds.tsx` state map so both surfaces read identically.
 * Meetings carry the meeting *type* (1:1s never reach this slice); open
 * absences reuse the TL tab's working-day SLA instead of a parallel copy.
 */
export const hbprRecordState = (
  resource: HbprRecordResource,
  status: string,
  isoDate?: string
): HbprRecordBadge => {
  switch (resource) {
    case "meetings":
      if (status === "tl_sync") return { label: "TL sync", tone: "info", icon: CircleDot };
      if (status === "team_meeting")
        return { label: "Team meeting", tone: "neutral", icon: CircleDot };
      return { label: humanize(status), tone: "neutral", icon: CircleDot };
    case "idle-flags":
      return status === "resolved"
        ? { label: "Resolved", tone: "success", icon: CheckCircle2 }
        : { label: "Open", tone: "warning", icon: Clock };
    case "absences":
      if (status === "addressed")
        return { label: "Addressed", tone: "success", icon: CheckCircle2 };
      if (isoDate) {
        const days = workingDaysOpen(isoDate);
        if (days > 5) return { label: "Over 5 working days open", tone: "danger", icon: Clock };
        return {
          label: `${days} working day${days === 1 ? "" : "s"} open`,
          tone: "warning",
          icon: Clock,
        };
      }
      return { label: "Open", tone: "warning", icon: Clock };
    case "review-deliveries":
      return { label: "Delivered", tone: "success", icon: CheckCircle2 };
    case "pip-records":
      if (status === "draft") return { label: "Pending approval", tone: "warning", icon: Clock };
      if (status === "active") return { label: "Active", tone: "info", icon: CircleDot };
      if (status === "completed")
        return { label: "Completed", tone: "success", icon: CheckCircle2 };
      if (status === "cancelled") return { label: "Cancelled", tone: "neutral", icon: Ban };
      return { label: humanize(status), tone: "neutral", icon: CircleDot };
    case "promotion-flags":
      if (status === "nominated")
        return { label: "Awaiting decision", tone: "warning", icon: Clock };
      if (status === "promoted") return { label: "Promoted", tone: "success", icon: CheckCircle2 };
      if (status === "declined") return { label: "Declined", tone: "neutral", icon: Ban };
      return { label: humanize(status), tone: "neutral", icon: CircleDot };
  }
};
