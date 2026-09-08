import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/FormDialog";
import { Label } from "@/components/ui/label";
import { FormErrorBanner } from "@/components/common/forms/FormErrorBanner";
import { TeamMultiSelect } from "./TeamMultiSelect";
import type { Team } from "@/types";

type ScopeMode = "unchanged" | "replace";
type StatusMode = "unchanged" | "active" | "inactive";

export interface BulkAccessUpdate {
  team_ids?: number[];
  is_active?: boolean;
}

interface BulkControlRoomAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  teams: Team[];
  onSubmit: (update: BulkAccessUpdate) => void;
  isSubmitting?: boolean;
  error?: string;
}

const modeButtonClass = (selected: boolean) =>
  selected ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-muted";

export const BulkControlRoomAccessDialog: React.FC<BulkControlRoomAccessDialogProps> = ({
  open,
  onOpenChange,
  selectedCount,
  teams,
  onSubmit,
  isSubmitting = false,
  error,
}) => {
  const [scopeMode, setScopeMode] = useState<ScopeMode>("unchanged");
  const [statusMode, setStatusMode] = useState<StatusMode>("unchanged");
  const [teamIds, setTeamIds] = useState<number[]>([]);

  const reset = () => {
    setScopeMode("unchanged");
    setStatusMode("unchanged");
    setTeamIds([]);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      ...(scopeMode === "replace" ? { team_ids: teamIds } : {}),
      ...(statusMode === "active"
        ? { is_active: true }
        : statusMode === "inactive"
          ? { is_active: false }
          : {}),
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Bulk update ${selectedCount} access record${selectedCount === 1 ? "" : "s"}`}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Apply changes"
    >
      <FormErrorBanner message={error} />
      <p className="text-sm text-muted-foreground">
        Choose only the settings you want to change. Unchanged settings are left as they are.
      </p>

      <div className="space-y-2">
        <Label>Team visibility</Label>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Team visibility action">
          <Button
            type="button"
            variant="outline"
            className={modeButtonClass(scopeMode === "unchanged")}
            onClick={() => setScopeMode("unchanged")}
          >
            Keep current
          </Button>
          <Button
            type="button"
            variant="outline"
            className={modeButtonClass(scopeMode === "replace")}
            onClick={() => setScopeMode("replace")}
          >
            Replace scope
          </Button>
        </div>
        {scopeMode === "replace" && (
          <>
            <TeamMultiSelect
              teams={teams}
              value={teamIds}
              onChange={setTeamIds}
              disabled={isSubmitting}
              placeholder="Choose the new team scope..."
            />
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This replaces each selected user's current scope. An empty selection means no
                visibility, not global access.
              </span>
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label>Access status</Label>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Access status action">
          {(["unchanged", "active", "inactive"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              variant="outline"
              className={modeButtonClass(statusMode === mode)}
              onClick={() => setStatusMode(mode)}
            >
              {mode === "unchanged"
                ? "Keep current"
                : mode === "active"
                  ? "Activate"
                  : "Deactivate"}
            </Button>
          ))}
        </div>
      </div>
    </FormDialog>
  );
};
