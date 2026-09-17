/**
 * CRScopeCard — read-only display of a CR user's assigned team scopes.
 *
 * Team scopes are managed by CR admins / full admins via the access
 * management page — CR users cannot self-assign teams.
 *
 * Rendered by SettingsPage through PluginCRScopeCard, never imported
 * directly (plugin boundary rule).
 */
import React from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { useControlRoomMe } from "../hooks/useControlRoomAccess";

export const CRScopeCard: React.FC = () => {
  const { data, isLoading, isError } = useControlRoomMe();
  const teams = data?.access?.team_scopes ?? [];

  return (
    <GlassCard delay={0.07}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Control Room Scope
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your Control Room team scope is managed by an administrator. It determines which teams'
          standby coverage you can see on the Control Room dashboard.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading teams…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">
            Could not load your team scope. Please try again later.
          </p>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No teams assigned. Contact your administrator to get team scope assigned.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1.5">
                <Users className="h-3 w-3" />
                {t.team_name}
                {t.team_code && (
                  <span className="text-xs text-muted-foreground">({t.team_code})</span>
                )}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
};
