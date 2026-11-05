import React from "react";
import { Info } from "lucide-react";
import { InfoCallout } from "@/components/ui/InfoCallout";

/** Explains the automatic payroll lifecycle so nobody waits for, or repeats, a manual step. */
export const AutomatedLifecycleNotice: React.FC = () => (
  <InfoCallout
    className="mb-4 items-start"
    icon={<Info className="h-4 w-4" />}
    label={
      <>
        <strong>Automated payroll lifecycle.</strong> The draft run is created on the last working
        day of the month. It is finalized automatically as soon as every Line Manager has closed
        their team, or at the cutoff (the 2nd of the next month, moved to the next working day).
        Manual changes are reserved for administrators.
      </>
    }
  />
);
