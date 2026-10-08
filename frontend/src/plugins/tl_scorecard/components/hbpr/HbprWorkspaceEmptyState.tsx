import React from "react";
import { Handshake } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";

/** Shown when the HBPR has no open Albanian-TL assignment: an onboarding state,
 * not an error. */
export const HbprWorkspaceEmptyState: React.FC = () => (
  <GlassCard animateOnMount={false} className="p-0">
    <EmptyState
      icon={Handshake}
      title="No Albanian team leaders assigned yet"
      description="An administrator pairs each Albanian team leader with an HR business partner. Once you are assigned, their governance records and partnership log appear here."
      className="py-16"
    />
  </GlassCard>
);
