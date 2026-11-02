import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconWell } from "@/components/ui/IconWell";
import { SearchField } from "@/components/ui/SearchField";
import { Chip } from "@/components/ui/Chip";
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

const PAGE_SIZE = 5;

export interface SuggestedTeamMovesProps {
  rows: TeamMoveSuggestion[];
  externalSearch?: string;
}

/** One row per person: the team that already works most of their clients (weighted by the overtime
 * they actually log) is the primary action, the rest are secondary. Nobody is added until the admin
 * presses a button. */
export const SuggestedTeamMoves: React.FC<SuggestedTeamMovesProps> = ({
  rows,
  externalSearch = "",
}) => {
  const qc = useQueryClient();
  const [localSearch, setLocalSearch] = useState("");
  const [basisFilter, setBasisFilter] = useState<"all" | "overtime" | "assignment">("all");
  const [page, setPage] = useState(1);

  const activeSearch = (externalSearch || localSearch).trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (basisFilter !== "all" && row.basis !== basisFilter) return false;
      if (!activeSearch) return true;
      const matchName =
        row.full_name.toLowerCase().includes(activeSearch) ||
        row.username.toLowerCase().includes(activeSearch);
      const matchCurrentTeam = row.current_teams.some(
        (t) =>
          t.name.toLowerCase().includes(activeSearch) || t.code.toLowerCase().includes(activeSearch)
      );
      const matchRecTeam =
        row.recommendation.team.name.toLowerCase().includes(activeSearch) ||
        row.recommendation.team.code.toLowerCase().includes(activeSearch);
      const matchClient =
        row.recommendation.clients.some(
          (c) =>
            c.name.toLowerCase().includes(activeSearch) ||
            c.code.toLowerCase().includes(activeSearch)
        ) ||
        row.remaining_clients.some(
          (c) =>
            c.name.toLowerCase().includes(activeSearch) ||
            c.code.toLowerCase().includes(activeSearch)
        );
      return matchName || matchCurrentTeam || matchRecTeam || matchClient;
    });
  }, [rows, basisFilter, activeSearch]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

  const overtimeCount = rows.filter((r) => r.basis === "overtime").length;
  const assignmentCount = rows.filter((r) => r.basis === "assignment").length;

  return (
    <GlassCard className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
              People whose clients nobody on their own team works. The suggested team is the one
              that already works most of them, weighted by the overtime the person logged in the
              last {rows[0]?.lookback_days ?? 90} days. Adding keeps their current teams; nothing
              changes until you press Add.
            </p>
          </div>
        </div>

        {!externalSearch && rows.length > 5 && (
          <div className="w-full shrink-0 sm:max-w-xs">
            <SearchField
              value={localSearch}
              onChange={(v) => {
                setLocalSearch(v);
                setPage(1);
              }}
              placeholder="Filter suggestions…"
              aria-label="Filter suggestions"
              onClear={() => setLocalSearch("")}
              controlSize="sm"
            />
          </div>
        )}
      </div>

      {rows.length > 3 && (
        <div className="border-border/40 mt-3 flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="text-muted-foreground text-xs font-medium">Basis:</span>
          <Chip
            pressed={basisFilter === "all"}
            onClick={() => {
              setBasisFilter("all");
              setPage(1);
            }}
          >
            All ({rows.length})
          </Chip>
          <Chip
            pressed={basisFilter === "overtime"}
            onClick={() => {
              setBasisFilter("overtime");
              setPage(1);
            }}
          >
            Overtime ({overtimeCount})
          </Chip>
          <Chip
            pressed={basisFilter === "assignment"}
            onClick={() => {
              setBasisFilter("assignment");
              setPage(1);
            }}
          >
            Assignment only ({assignmentCount})
          </Chip>
          {filteredRows.length !== rows.length && (
            <span className="text-muted-foreground ml-auto text-xs">
              Showing {filteredRows.length} of {rows.length}
            </span>
          )}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-xs italic">
          No suggestions match your filters.
        </p>
      ) : (
        <ul className="divide-border/60 mt-3 divide-y text-sm">
          {pagedRows.map((row) => (
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
                  <span className="text-muted-foreground text-xs">
                    no overtime logged, assignment only
                  </span>
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
      )}

      {totalPages > 1 && (
        <div className="border-border/60 mt-3 flex items-center justify-between border-t pt-3 text-xs">
          <span className="text-muted-foreground tabular-nums">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}{" "}
            suggestions
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="control-sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous suggestions page"
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </Button>
            <span className="text-muted-foreground font-mono tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="control-sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next suggestions page"
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  );
};
