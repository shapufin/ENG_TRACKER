/**
 * CRBulkCommandDrawer — bulk edit drawer for CR admins.
 *
 * Mirrors the field set of the single-user EditCRUserDialog minus
 * per-user basic info (first_name etc.): team scopes (replace) and
 * is_active toggle. Calls the bulk_update_cr_users endpoint.
 *
 * Rendered by UsersPageContent when isCROnlyAdmin is true, in place of
 * the standard UserBulkCommandDrawer (which targets UserProfile fields
 * that CR admins cannot manage).
 */
import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Shield, Power, AlertCircle } from "lucide-react";
import { BulkDrawerHeader } from "@/components/ui/BulkDrawerHeader";
import { TeamMultiSelect } from "./TeamMultiSelect";
import { useBulkUpdateCRUsers } from "../hooks/useControlRoomAccess";
import type { Team } from "@/types";

interface CRBulkCommandDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUserIds: number[];
  selectedNames: string[];
  teams: Team[];
  onClearSelection: () => void;
}

type TabValue = "scopes" | "access";

export const CRBulkCommandDrawer: React.FC<CRBulkCommandDrawerProps> = ({
  open,
  onOpenChange,
  selectedUserIds,
  selectedNames,
  teams,
  onClearSelection,
}) => {
  const [activeTab, setActiveTab] = useState<TabValue>("scopes");
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [error, setError] = useState<string>("");
  const bulkMut = useBulkUpdateCRUsers();

  const selectedCount = selectedUserIds.length;
  const displayName =
    selectedCount > 3
      ? `${selectedNames.slice(0, 3).join(", ")} +${selectedCount - 3} more`
      : selectedNames.join(", ");

  const resetState = () => {
    setTeamIds([]);
    setIsActive(null);
    setError("");
    setActiveTab("scopes");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  /** Shared mutation callbacks — identical for both bulk actions. */
  const makeBulkCallbacks = () => ({
    onSuccess: (res: { failed_ids: number[]; total_requested: number }) => {
      if (res.failed_ids.length === 0) {
        resetState();
        onClearSelection();
        handleOpenChange(false);
      } else {
        setError(`${res.failed_ids.length} of ${res.total_requested} updates failed.`);
      }
    },
    onError: (err: unknown) => {
      const anyErr = err as { response?: { data?: { error?: string } } };
      setError(anyErr?.response?.data?.error || "Failed to bulk update CR users.");
    },
  });

  const handleApplyScopes = () => {
    if (selectedUserIds.length === 0) return;
    setError("");
    bulkMut.mutate({ user_ids: selectedUserIds, team_ids: teamIds }, makeBulkCallbacks());
  };

  const handleApplyAccess = () => {
    if (selectedUserIds.length === 0 || isActive === null) return;
    setError("");
    bulkMut.mutate({ user_ids: selectedUserIds, is_active: isActive }, makeBulkCallbacks());
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <BulkDrawerHeader
          count={selectedCount}
          title="CR Bulk Actions"
          subtitle={displayName}
          onClearAndClose={() => {
            onClearSelection();
            handleOpenChange(false);
          }}
        />

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scopes" className="gap-2">
              <Shield className="h-4 w-4" /> Team Scopes
            </TabsTrigger>
            <TabsTrigger value="access" className="gap-2">
              <Power className="h-4 w-4" /> Access
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scopes" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Replace Team Scopes</Label>
              <TeamMultiSelect teams={teams} value={teamIds} onChange={setTeamIds} />
              <p className="text-xs text-muted-foreground">
                Replaces all team scopes for every selected CR user. Empty scope means no visibility
                (not global). Admin/staff always have global access.
              </p>
            </div>
            <Button onClick={handleApplyScopes} disabled={bulkMut.isPending || selectedCount === 0}>
              {bulkMut.isPending ? "Applying..." : `Replace Scopes for ${selectedCount} Users`}
            </Button>
          </TabsContent>

          <TabsContent value="access" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>CR Access State</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: true, label: "Enable CR access" },
                    { value: false, label: "Disable CR access" },
                  ] as const
                ).map((option) => {
                  const selected = isActive === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setIsActive(selected ? null : option.value)}
                      className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 bg-background/40 hover:bg-muted"
                      }`}
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Apply to every selected user
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Toggles the is_active flag on every selected CR user's access record.
              </p>
            </div>
            <Button
              onClick={handleApplyAccess}
              disabled={bulkMut.isPending || selectedCount === 0 || isActive === null}
            >
              {bulkMut.isPending ? "Applying..." : `Update Access for ${selectedCount} Users`}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
