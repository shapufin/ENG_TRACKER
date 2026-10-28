import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userService } from "@/services/userService";
import type { Team } from "@/types";

const LABELS: Record<string, string> = {
  user_memberships: "Members",
  control_room_scopes: "Control Room scopes",
  sub_teams: "Sub-teams",
  engagement_metrics: "Engagement metrics",
  calendar_workspaces: "Calendar workspaces with holidays",
  analytics_metrics: "Analytics metrics",
};

const labelOf = (key: string) => LABELS[key] ?? key.replace(/_/g, " ");

const formatDate = (value: string | null) => (value ? value.slice(0, 10) : "None");

interface TeamLifecycleDialogProps {
  team: Team;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}

const CountRows: React.FC<{
  title: string;
  counts: Record<string, number>;
  labels?: Record<string, string>;
}> = ({ title, counts, labels = {} }) => {
  const entries = Object.entries(counts);
  return (
    <section aria-label={title} className="space-y-1">
      <h3 className="text-sm font-medium">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">None</p>
      ) : (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {entries.map(([key, count]) => (
            <React.Fragment key={key}>
              <dt className="text-muted-foreground">{labels[key] ?? labelOf(key)}</dt>
              <dd className="tabular-nums">{count}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </section>
  );
};

/**
 * What an archived team still holds, when it can be purged, and the one path to
 * deleting it now. Deleting is only offered when the server reports no blockers.
 */
export const TeamLifecycleDialog: React.FC<TeamLifecycleDialogProps> = ({
  team,
  open,
  onOpenChange,
  onDelete,
  isDeleting,
}) => {
  const [typed, setTyped] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "teams", "lifecycle", team.id],
    queryFn: () => userService.getTeamLifecycle(team.id),
  });
  const inputId = `delete-team-${team.id}`;
  const canDelete = !!data && data.delete_blockers.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{team.name}: team data</DialogTitle>
          <DialogDescription>
            Archiving keeps every record. An archived team can be purged once a year has passed and
            nothing depends on it (the purge runs from the monthly cron); its metric history is
            kept.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {isLoading || !data ? (
            <p role="status" className="text-muted-foreground text-sm">
              Loading...
            </p>
          ) : (
            <>
              <section aria-label="Overview" className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Members: </span>
                  <span className="tabular-nums">{data.members_count}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Archived on: </span>
                  <span>{formatDate(data.archived_at)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Eligible for purge: </span>
                  <span>{formatDate(data.purge_eligible_at)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Last activity: </span>
                  <span>{formatDate(data.last_activity)}</span>
                </p>
              </section>
              <CountRows title="Records kept" counts={data.counts} />
              <CountRows
                title="Detached when deleted"
                counts={data.cascade_counts}
                labels={{ calendar_workspaces: "Calendar workspaces" }}
              />
              {canDelete ? (
                <section aria-label="Delete team" className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    Nothing depends on this team. Deleting it is permanent.
                  </p>
                  <Label htmlFor={inputId}>Type {team.code} to confirm</Label>
                  <Input
                    id={inputId}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={typed !== team.code || isDeleting}
                    onClick={() => onDelete(team.id)}
                  >
                    Delete team
                  </Button>
                </section>
              ) : (
                <section aria-label="Why it cannot be deleted" className="space-y-1">
                  <h3 className="text-sm font-medium">Cannot be deleted yet</h3>
                  <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                    {(data?.delete_blockers ?? []).map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
