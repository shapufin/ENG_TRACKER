import React from "react";
import { TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PROFICIENCY_LEVELS, levelColor, levelLabel } from "../utils/proficiencyLevels";
import type { SkillRateTarget } from "./SkillsMemberList";

interface RateSkillDialogProps {
  target: SkillRateTarget | null;
  isPending: boolean;
  onSubmit: (level: number) => void;
  onClose: () => void;
}

/** One-click L1–L5 rate stepper dialog shared by desktop cells and mobile cards. */
export const RateSkillDialog: React.FC<RateSkillDialogProps> = ({
  target,
  isPending,
  onSubmit,
  onClose,
}) => {
  const canIncrement = !!target && target.currentLevel < 5;
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm border-border/70 bg-popover">
        <DialogHeader>
          <DialogTitle>Rate Skill</DialogTitle>
          <DialogDescription>Choose a proficiency level for this skill.</DialogDescription>
        </DialogHeader>
        {target && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">{target.username}</p>
              <p className="text-xs text-muted-foreground">{target.skillName}</p>
              <p className="mt-1 text-sm">
                Currently rated{" "}
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold ${levelColor(target.currentLevel)}`}
                >
                  L{target.currentLevel} — {levelLabel(target.currentLevel)}
                </span>
              </p>
            </div>
            {canIncrement && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isPending}
                aria-label={`Increase to L${target.currentLevel + 1}`}
                onClick={() => onSubmit(target.currentLevel + 1)}
              >
                <TrendingUp className="mr-2 h-4 w-4" aria-hidden="true" />
                +1 Level (L{target.currentLevel + 1})
              </Button>
            )}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Select new level</p>
              <div className="flex gap-1.5">
                {PROFICIENCY_LEVELS.map((l) => (
                  <button
                    key={l.level}
                    type="button"
                    onClick={() => onSubmit(l.level)}
                    disabled={isPending}
                    aria-pressed={target.currentLevel === l.level}
                    title={l.label}
                    className={`inline-flex h-9 min-h-[44px] flex-1 items-center justify-center rounded border text-sm font-semibold transition-colors hover:opacity-80 ${levelColor(l.level)} ${target.currentLevel === l.level ? "ring-2 ring-ring ring-offset-1" : ""}`}
                  >
                    L{l.level}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
