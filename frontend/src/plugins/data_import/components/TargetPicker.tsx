import React, { useRef } from "react";
import { Check } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconWell } from "@/components/ui/IconWell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ImportSampleButton } from "./ImportSampleButton";
import { targetIcon } from "./targetIcons";
import type { ImportTarget } from "../types/dataImport";

interface TargetPickerProps {
  targets: ImportTarget[];
  selectedTargetKey: string | null;
  onSelect: (targetKey: string) => void;
}

export const TargetPicker: React.FC<TargetPickerProps> = ({
  targets,
  selectedTargetKey,
  onSelect,
}) => {
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Roving tabindex: the selected card is the tab stop, else the first.
  const selectedIndex = targets.findIndex((t) => t.target_key === selectedTargetKey);
  const tabStopIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index - 1;
    else return;
    event.preventDefault();
    next = (next + targets.length) % targets.length;
    radioRefs.current[next]?.focus();
    onSelect(targets[next].target_key);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Import target"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {targets.map((target, index) => {
        const isSelected = selectedTargetKey === target.target_key;
        const Icon = targetIcon(target.icon);
        return (
          <GlassCard
            key={target.target_key}
            interactive
            className={cn(
              "focus-within:ring-ring flex flex-col focus-within:ring-2",
              isSelected && "ring-primary ring-2"
            )}
          >
            <div className="flex items-start gap-3 p-4 pb-2">
              <IconWell tone="info" size="sm">
                <Icon className="h-4 w-4" />
              </IconWell>
              <h3 className="min-w-0 flex-1 text-base leading-tight font-semibold">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={index === tabStopIndex ? 0 : -1}
                  ref={(el) => {
                    radioRefs.current[index] = el;
                  }}
                  onClick={() => onSelect(target.target_key)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className="text-left outline-none after:absolute after:inset-0 after:content-['']"
                >
                  {target.display_name}
                </button>
              </h3>
              {isSelected && (
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                >
                  <Check className="h-3 w-3" />
                </span>
              )}
              <Badge variant="secondary" className="shrink-0">
                {target.fields.length} fields
              </Badge>
            </div>
            <p
              className="text-muted-foreground line-clamp-3 flex-1 px-4 pb-3 text-sm"
              title={target.description}
            >
              {target.description}
            </p>
            <div className="relative z-10 border-t p-3">
              <ImportSampleButton targetKey={target.target_key} />
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
};
