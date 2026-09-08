import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Label } from "@/components/ui/label";
import { FormErrorBanner } from "@/components/common/forms/FormErrorBanner";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import { UserPicker } from "./UserPicker";
import { TeamMultiSelect } from "./TeamMultiSelect";
import { useCreateControlRoomAccess } from "../hooks/useControlRoomAccess";
import type { ControlRoomEligibleUser } from "@/services/userService";
import type { Team } from "@/types";

interface GrantControlRoomAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
  existingUserIds: number[];
  initialUserId?: number | null;
}

export const GrantControlRoomAccessDialog: React.FC<GrantControlRoomAccessDialogProps> = ({
  open,
  onOpenChange,
  teams,
  existingUserIds,
  initialUserId = null,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(initialUserId);
  const [selectedUser, setSelectedUser] = useState<ControlRoomEligibleUser | undefined>();
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [error, setError] = useState<string>();
  const createMutation = useCreateControlRoomAccess();

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSelectedUserId(initialUserId ?? null);
      setSelectedUser(undefined);
      setTeamIds([]);
      setError(undefined);
    } else {
      setSelectedUserId(null);
      setSelectedUser(undefined);
      setTeamIds([]);
      setError(undefined);
    }
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUserId) {
      setError("Select an existing user before granting access.");
      return;
    }

    createMutation.mutate(
      { user: selectedUserId, team_ids: teamIds },
      {
        onSuccess: () => handleOpenChange(false),
        onError: (requestError: unknown) =>
          setError(extractApiErrorMessage(requestError, "Failed to grant Control Room access.")),
      }
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Grant Control Room access"
      onSubmit={handleSubmit}
      isSubmitting={createMutation.isPending}
      submitLabel="Grant access"
    >
      <FormErrorBanner message={error} />
      <div className="space-y-2">
        <Label>Select user</Label>
        <UserPicker
          value={selectedUserId}
          onChange={(id, user) => {
            setSelectedUserId(id);
            setSelectedUser(user);
            setError(undefined);
          }}
          excludeUserIds={existingUserIds}
          placeholder="Search by name, username, or email..."
          disabled={createMutation.isPending}
        />
        {selectedUser && (
          <p className="text-xs text-muted-foreground">
            {selectedUser.full_name || selectedUser.username} will receive read-only access.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Team visibility</Label>
        <TeamMultiSelect
          teams={teams}
          value={teamIds}
          onChange={setTeamIds}
          disabled={createMutation.isPending}
          placeholder="Choose teams this user can view..."
        />
        <p className="text-xs text-muted-foreground">
          No teams means no visibility. It does not grant global access.
        </p>
      </div>
    </FormDialog>
  );
};
