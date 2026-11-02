import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shuffle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconWell } from "@/components/ui/IconWell";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import { plural } from "@/lib/plural";
import type { TeamMoveSuggestion } from "@/types";

/** Everything a membership change can leave stale: the Teams and Users pages, calendars and both checks. */
const STALE_KEYS = [
  ["admin", "teams"],
  ["admin", "users"],
  ["admin", "profiles"],
  ["admin", "user-stats"],
  ["admin", "orphans"],
  ["admin", "team-suggestions"],
] as const;

type Option = TeamMoveSuggestion["recommendation"];

const hoursLabel = (hours: number) => `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;

/** Why this team: what its members already do on the person's clients. */
const evidence = (option: Option) =>
  `${plural(option.sharing, "teammate")} already work${option.sharing === 1 ? "s" : ""} ${option.clients
    .map((c) => c.name)
    .join(", ")}${option.team_hours > 0 ? `, ${hoursLabel(option.team_hours)} logged` : ""}`;

/** One row per person: the team that already works most of their clients (weighted by the overtime
 * they actually log) is the primary action, the rest are secondary. Nobody is added until the admin
 * presses a button. */
export const SuggestedTeamMoves: React.FC<{ rows: TeamMoveSuggestion[] }> = ({ rows }) => {
  const qc = useQueryClient();
  const addMutation = useMutation({
    mutationFn: ({ row, option }: { row: TeamMoveSuggestion; option: Option }) =>
      userService.updateUser(row.user_id, { add_teams: [option.team.id] }),
    onSuccess: async (_data, { row, option }) => {
      toast.success(`Added ${row.full_name} to ${option.team.name}`);
      await Promise.all(STALE_KEYS.map((key) => qc.invalidateQueries({ queryKey: [...key] })));
    },
    onError: handleApiError,
  });

  const addButton = (row: TeamMoveSuggestion, option: Option, primary: boolean) => {
    const pending =
      addMutation.isPending &&
      addMutation.variables?.row.user_id === row.user_id &&
      addMutation.variables.option.team.id === option.team.id;
    return (
      <Button
        type="button"
        variant={primary ? "default" : "outline"}
        size="control-sm"
        disabled={addMutation.isPending}
        aria-label={`Add ${row.full_name} to ${option.team.name}`}
        onClick={() => addMutation.mutate({ row, option })}
      >
        {pending ? "Adding…" : primary ? `Add to ${option.team.name}` : option.team.name}
      </Button>
    );
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-3">
        <IconWell tone="accent">
          <Shuffle className="h-4 w-4" aria-hidden="true" />
        </IconWell>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            Suggested team moves{" "}
            <span className="text-muted-foreground tabular-nums">({rows.length})</span>
          </h2>
          <p className="text-muted-foreground text-xs">
            People whose clients nobody on their own team works. The suggested team is the one that
            already works most of them, weighted by the overtime the person logged in the last{" "}
            {rows[0]?.lookback_days ?? 90} days. Adding keeps their current teams; nothing changes
            until you press Add.
          </p>
        </div>
      </div>
      <ul className="divide-border/60 mt-3 divide-y text-sm">
        {rows.map((row) => (
          <li key={row.user_id} className="flex flex-col gap-2 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium">{row.full_name}</span>
                <span className="text-muted-foreground block text-xs">
                  {row.current_teams.length > 0
                    ? `Currently in ${row.current_teams.map((t) => t.name).join(", ")}`
                    : "Not in any team"}
                </span>
              </div>
              {addButton(row, row.recommendation, true)}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {row.recommendation.clients.map((client) => (
                <Badge key={client.id} variant={client.hours > 0 ? "info" : "neutral"}>
                  {client.name}
                  {client.hours > 0 ? ` · ${hoursLabel(client.hours)}` : ""}
                </Badge>
              ))}
              {row.basis === "assignment" && (
                <span className="text-muted-foreground text-xs">no overtime logged, assignment only</span>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {evidence(row.recommendation)}
              {!row.recommendation.has_approver && (
                <>
                  {" · "}
                  <span className="text-tone-warning-text">no approver yet</span>
                </>
              )}
            </p>
            {row.remaining_clients.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Still uncovered: {row.remaining_clients.map((c) => c.name).join(", ")}
              </p>
            )}
            {row.alternatives.length > 0 && (
              <div className="flex flex-wrap items-start gap-3 text-xs">
                <span className="text-muted-foreground pt-1.5">Or add to</span>
                {row.alternatives.map((option) => (
                  <span key={option.team.id} className="flex flex-col gap-0.5">
                    {addButton(row, option, false)}
                    <span className="text-muted-foreground">
                      {evidence(option)}
                      {!option.has_approver && " · no approver yet"}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
};
