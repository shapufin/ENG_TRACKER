import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shuffle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Ana works Acme and nobody on her team does: add her to a team that does." One click, admin only;
 * nobody is added until the admin presses the button. */
export const SuggestedTeamMoves: React.FC<{ rows: TeamMoveSuggestion[] }> = ({ rows }) => {
  const qc = useQueryClient();
  const addMutation = useMutation({
    mutationFn: ({ row, teamId }: { row: TeamMoveSuggestion; teamId: number; teamName: string }) =>
      userService.updateUser(row.user_id, { teams: [...row.team_ids, teamId] }),
    onSuccess: async (_data, { row, teamName }) => {
      toast.success(`Added ${row.full_name} to ${teamName}`);
      await Promise.all(STALE_KEYS.map((key) => qc.invalidateQueries({ queryKey: [...key] })));
    },
    onError: handleApiError,
  });

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-3">
        <Shuffle className="text-muted-foreground mt-0.5 h-4 w-4" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold">
            Suggested team moves{" "}
            <span className="text-muted-foreground tabular-nums">({rows.length})</span>
          </h2>
          <p className="text-muted-foreground text-xs">
            Works a client that nobody on their own team works. Nothing moves until you press Add.
          </p>
        </div>
      </div>
      <ul className="divide-border/60 mt-3 divide-y text-sm">
        {rows.map((row) =>
          row.suggestions.map((suggestion) => (
            <li
              key={`${row.user_id}-${suggestion.client.id}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span>
                <span className="font-medium">{row.full_name}</span> works{" "}
                <span className="font-medium">{suggestion.client.name}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {suggestion.teams.map((team) => (
                  <Button
                    key={team.id}
                    type="button"
                    variant="outline"
                    size="control-sm"
                    disabled={addMutation.isPending}
                    aria-label={`Add ${row.full_name} to ${team.name}`}
                    onClick={() => addMutation.mutate({ row, teamId: team.id, teamName: team.name })}
                  >
                    Add to {team.name}
                    <span className="text-muted-foreground text-xs">
                      {plural(team.sharing, "teammate")}
                    </span>
                  </Button>
                ))}
              </span>
            </li>
          ))
        )}
      </ul>
    </GlassCard>
  );
};
