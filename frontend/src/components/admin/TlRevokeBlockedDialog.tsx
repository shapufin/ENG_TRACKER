import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TeamLeaderSelect } from "@/components/admin/TeamLeaderSelect";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import type { BlockedRevocation } from "@/types";

interface TeamLeaderOption {
  id: number;
  full_name: string;
}

interface TlRevokeBlockedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockedRevocations: BlockedRevocation[];
  italianTLs: TeamLeaderOption[];
  albanianTLs: TeamLeaderOption[];
  /** Re-submits the original save that got blocked. Only enabled once
   * every dependent below has been reassigned or cleared. */
  onRetry: () => void;
  retrying?: boolean;
}

const roleLabel: Record<BlockedRevocation["role"], string> = {
  italian_tl: "Italian TL",
  albanian_tl: "Albanian TL",
};

const dependentKey = (role: string, profileId: number) => `${role}:${profileId}`;

/** Shown when bulk_update/update_user rejects a TL-role revoke because
 * dependents still have italian_tl/albanian_tl pointed at the user being
 * revoked (apps/users/viewsets.py's blocked_revocations). Lets the admin
 * reassign each dependent to a different TL, or clear them to "no TL",
 * right here — then retries the original revoke. */
export const TlRevokeBlockedDialog: React.FC<TlRevokeBlockedDialogProps> = ({
  open,
  onOpenChange,
  blockedRevocations,
  italianTLs,
  albanianTLs,
  onRetry,
  retrying = false,
}) => {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const totalDependents = useMemo(
    () => blockedRevocations.reduce((sum, b) => sum + b.dependents.length, 0),
    [blockedRevocations]
  );
  const allResolved = totalDependents > 0 && resolved.size >= totalDependents;

  const handleChange = (
    role: BlockedRevocation["role"],
    profileId: number,
    teamLeaderUserId: number | null
  ) => {
    const key = dependentKey(role, profileId);
    setSavingKeys((prev) => new Set(prev).add(key));
    return userService
      .setTeamLeader(profileId, role, teamLeaderUserId)
      .then(() => {
        setResolved((prev) => new Set(prev).add(key));
      })
      .catch((error) => handleApiError(error))
      .finally(() =>
        setSavingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        })
      );
  };

  const handleBulkChange = (
    role: BlockedRevocation["role"],
    profileIds: number[],
    teamLeaderUserId: number | null
  ) => {
    profileIds.forEach((profileId) => handleChange(role, profileId, teamLeaderUserId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Reassign team members first</DialogTitle>
          <DialogDescription>
            These users still have the TL you're removing assigned to them. Pick a
            replacement TL or clear each one before continuing.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {blockedRevocations.map((blocked) => {
            const groupOptions = blocked.role === "italian_tl" ? italianTLs : albanianTLs;
            const groupSaving = blocked.dependents.some((dependent) =>
              savingKeys.has(dependentKey(blocked.role, dependent.profile_id))
            );
            return (
              <div key={`${blocked.user_id}-${blocked.role}`} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {blocked.username} — {roleLabel[blocked.role]}
                  </p>
                  <div className="w-48">
                    <TeamLeaderSelect
                      ariaLabel={`Bulk reassign ${roleLabel[blocked.role]} for ${blocked.username}`}
                      value={null}
                      options={groupOptions}
                      disabled={groupSaving}
                      onChange={(teamLeaderUserId) =>
                        handleBulkChange(
                          blocked.role,
                          blocked.dependents.map((dependent) => dependent.profile_id),
                          teamLeaderUserId
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  {blocked.dependents.map((dependent) => {
                    const key = dependentKey(blocked.role, dependent.profile_id);
                    const isResolved = resolved.has(key);
                    return (
                      <div
                        key={dependent.profile_id}
                        className="flex items-center gap-3 rounded-lg border border-border p-2"
                      >
                        <span className="w-32 shrink-0 truncate text-sm">
                          {dependent.username}
                        </span>
                        <div className="flex-1">
                          <TeamLeaderSelect
                            ariaLabel={`Reassign ${roleLabel[blocked.role]} for ${dependent.username}`}
                            value={null}
                            options={groupOptions}
                            disabled={savingKeys.has(key) || isResolved}
                            onChange={(teamLeaderUserId) =>
                              handleChange(blocked.role, dependent.profile_id, teamLeaderUserId)
                            }
                          />
                        </div>
                        {isResolved && (
                          <span className="shrink-0 text-xs font-medium text-tone-success-text">
                            Resolved
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onRetry} disabled={!allResolved || retrying}>
            {retrying ? "Retrying..." : "Retry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
