import React from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoCallout } from "@/components/ui/InfoCallout";
import type { HbprPartnershipAssignment } from "../../types/tlScorecard";

interface HbprCadenceMissingBannerProps {
  assignment: Pick<HbprPartnershipAssignment, "cadence_missing" | "can_edit_cadence"> | null | undefined;
  onSetUp: () => void;
}

/**
 * Asks the assigned Line Manager to choose their HBPR meeting schedule. Shown
 * only while the server reports the cadence missing and lets this viewer edit it.
 */
export const HbprCadenceMissingBanner: React.FC<HbprCadenceMissingBannerProps> = ({
  assignment,
  onSetUp,
}) => {
  if (!assignment?.cadence_missing || !assignment.can_edit_cadence) return null;
  return (
    <InfoCallout
      role="status"
      tone="warning"
      icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
      label={
        <span className="block">
          <span className="block font-semibold">Set your HBPR meeting cadence</span>
          <span className="text-muted-foreground block text-xs">
            Your HR business partner is waiting for your meeting schedule. Until you choose one, no
            meeting due dates are tracked.
          </span>
        </span>
      }
      className="items-start"
    >
      <Button size="sm" onClick={onSetUp} className="shrink-0">
        Set cadence
      </Button>
    </InfoCallout>
  );
};
