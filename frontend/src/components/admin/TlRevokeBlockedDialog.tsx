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
  hbpr: "HBPR",
};

const dependentKey = (role: string, profileId: number) => `${role}:${profileId}`;

/** Shown when bulk_update/update_user rejects a role revoke — either TL-role
 * revokes whose dependents still have italian_tl/albanian_tl pointed at the
 * user (reassignable right here), or hbpr/albanian_tl revokes blocked by an
 * open HBPR↔AL-TL assignment (entries with empty dependents + an
 * assignment_count; those resolve on the HBPR assignments page, not here).
 * See apps/users/viewsets.py's blocked_revocations. */
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
  // HBPR-guard entries carry no dependents (they resolve outside the dialog),
  // so Retry unlocks once every listed dependent is reassigned — including
  // when the response is HBPR-only (zero dependents → immediately retryable).
  const allResolved = blockedRevocations.length > 0 && resolved.size >= totalDependents;

  const handleChange = (
    role: Exclude<BlockedRevocation["role"], "hbpr">,
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
    role: Exclude<BlockedRevocation["role"], "hbpr">,
    profileIds: number[],
    teamLeaderUserId: number | null
  ) => {
    profileIds.forEach((profileId) => handleChange(role, profileId, teamLeaderUserId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Resolve dependencies first</DialogTitle>
          <DialogDescription>
            This role change is blocked: users still report to the TL being removed, or open
            HBPR↔Albanian TL assignments depend on the role. Reassign each dependent below — and end
            open assignments under Admin → HBPR assignments — then retry.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {blockedRevocations.map((blocked) => {
            if (blocked.dependents.length === 0) {
              return (
                <div key={`${blocked.user_id}-${blocked.role}`} className="space-y-2">
                  <p className="text-sm font-medium">
                    {blocked.username} — {roleLabel[blocked.role]}
                  </p>
                  <p className="border-border text-muted-foreground rounded-lg border p-2 text-xs">
                    {blocked.assignment_count ?? 0} open HBPR↔Albanian TL assignment(s) depend on
                    this role. End them under Admin → HBPR assignments, then retry.
                  </p>
                </div>
              );
            }
            const groupOptions = blocked.role === "italian_tl" ? italianTLs : albanianTLs;
            // Entries with dependents are always TL-guard blocks — hbpr-guard
            // entries returned early above with the assignment_count line.
            const tlRole = blocked.role as "italian_tl" | "albanian_tl";
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
                          tlRole,
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
                        className="border-border flex items-center gap-3 rounded-lg border p-2"
                      >
                        <span className="w-32 shrink-0 truncate text-sm">{dependent.username}</span>
                        <div className="flex-1">
                          <TeamLeaderSelect
                            ariaLabel={`Reassign ${roleLabel[blocked.role]} for ${dependent.username}`}
                            value={null}
                            options={groupOptions}
                            disabled={savingKeys.has(key) || isResolved}
                            onChange={(teamLeaderUserId) =>
                              handleChange(tlRole, dependent.profile_id, teamLeaderUserId)
                            }
                          />
                        </div>
                        {isResolved && (
                          <span className="text-tone-success-text shrink-0 text-xs font-medium">
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
