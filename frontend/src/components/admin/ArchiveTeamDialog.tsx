import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { userService } from "@/services/userService";
import type { Team } from "@/types";

interface ArchiveTeamDialogProps {
  team: Team | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number) => void;
  isArchiving?: boolean;
}

/**
 * Says exactly what archiving does, using the live member count, and lists the
 * reasons the server would refuse (pending requests, sub-teams, an open HBPR
 * assignment) so the admin sees them before pressing the button.
 */
export const ArchiveTeamDialog: React.FC<ArchiveTeamDialogProps> = ({
  team,
  onOpenChange,
  onConfirm,
  isArchiving = false,
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "teams", "lifecycle", team?.id],
    queryFn: () => userService.getTeamLifecycle(team!.id),
    enabled: !!team,
  });

  const members = data?.members_count;
  const unassigned =
    members === undefined
      ? "Every member will be unassigned"
      : `${members} member${members === 1 ? "" : "s"} will be unassigned`;
  const blockers = data?.archive_blockers ?? [];

  return (
    <ConfirmDialog
      open={!!team}
      onOpenChange={onOpenChange}
      title="Archive team"
      description={
        team
          ? `${team.name} is hidden from pickers and closed to new members. ${unassigned} ` +
            "(unarchiving does not restore them; who was in the team is kept as history). " +
            "Overtime, standby, leave and metric records are all kept." +
            (blockers.length ? ` It cannot be archived yet: ${blockers.join(" ")}` : "")
          : undefined
      }
      confirmLabel="Archive team"
      variant="destructive"
      isConfirming={isArchiving}
      // Unknown blockers must not look like "none": wait for the lifecycle read.
      confirmDisabled={isLoading || !data || blockers.length > 0}
      onConfirm={() => team && onConfirm(team.id)}
    />
  );
};
