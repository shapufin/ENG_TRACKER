import React from "react";
import { Network } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";

/**
 * Team-context pill for the AppShell desktop strip (mockup top-bar team
 * chip). Renders only for team leaders with a team. Shows the team name +
 * code from the auth profile — no member count (TeamSummary carries no
 * count; inventing one is forbidden).
 */
export const TeamContextPill: React.FC = () => {
  const { user } = useAuth();
  const { isTeamLeader } = usePermissions();
  const team = user?.teams?.[0];

  if (!isTeamLeader || !team) {
    return null;
  }

  return (
    <div
      aria-label="Team context"
      className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-muted px-3 py-1.5 text-[13px]"
    >
      <Network className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="truncate font-semibold text-foreground">{team.name}</span>
      {team.code && <span className="shrink-0 text-xs text-muted-foreground">{team.code}</span>}
    </div>
  );
};
