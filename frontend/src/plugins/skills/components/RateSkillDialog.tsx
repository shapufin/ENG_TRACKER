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
      <DialogContent size="sm" className="border-border/70">
        <DialogHeader className="shrink-0">
          <DialogTitle>Rate Skill</DialogTitle>
          <DialogDescription>Choose a proficiency level for this skill.</DialogDescription>
        </DialogHeader>
        {target && (
          <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto">
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
              <span
                id="rate-tier-label"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Select new level
              </span>
              <div role="group" aria-labelledby="rate-tier-label" className="space-y-2">
                {PROFICIENCY_LEVELS.map((l) => {
                  const selected = target.currentLevel === l.level;
                  return (
                    <button
                      key={l.level}
                      type="button"
                      onClick={() => onSubmit(l.level)}
                      disabled={isPending}
                      aria-pressed={selected}
                      aria-label={`L${l.level} ${l.label}`}
                      className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                        selected
                          ? "border-primary/60 bg-card text-foreground shadow-sm ring-2 ring-primary/20"
                          : "border-border bg-surface-sunken text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-xs font-bold ${levelColor(l.level)}`}
                      >
                        L{l.level}
                      </span>
                      <span className="text-xs font-semibold">{l.label}</span>
                      {selected && (
                        <span
                          aria-hidden="true"
                          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
