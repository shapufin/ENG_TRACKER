import React, { useState } from "react";
import { Check, ChevronDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneFillClass } from "@/components/ui/tone";

export interface CalendarSidebarLayer {
  id: number;
  name: string;
  code?: string;
  /**
   * Members of this workspace. Absent while the roster has not been requested —
   * the endpoint only answers for selected workspaces, so an unknown count is
   * left blank rather than rendered as a misleading `0`.
   */
  count?: number;
  active: boolean;
}

/** Same deterministic dot cycle the workspace picker uses; the API's hex is not a token. */
const DOT_TONES = ["success", "accent", "warning", "danger", "info", "neutral"] as const;

interface CalendarSidebarLayersProps {
  layers: CalendarSidebarLayer[];
  onToggleLayer: (id: number) => void;
}

/**
 * The workspaces this calendar can show, as switchable layers. Selecting one is
 * the same action as the header's workspace selector — there is no second
 * selection model.
 */
export const CalendarSidebarLayers: React.FC<CalendarSidebarLayersProps> = ({
  layers,
  onToggleLayer,
}) => {
  const [open, setOpen] = useState(true);
  if (layers.length === 0) return null;

  const activeCount = layers.filter((layer) => layer.active).length;

  return (
    <div className="border-border/60 border-b px-2 py-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="calendar-sidebar-layers"
        className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-1.5 rounded-md px-1 py-1 text-[10px] font-bold tracking-wider uppercase transition"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Layers className="text-primary h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Team Layers ({activeCount})</span>
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="calendar-sidebar-layers"
          className="bg-muted/40 border-border/60 mt-1 space-y-0.5 rounded-lg border p-1"
        >
          {layers.map((layer, index) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => onToggleLayer(layer.id)}
              aria-pressed={layer.active}
              title={layer.code ? `${layer.name} (${layer.code})` : layer.name}
              className={cn(
                "hover:bg-card focus-visible:ring-ring/60 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition focus-visible:ring-1 focus-visible:outline-hidden",
                !layer.active && "opacity-60"
              )}
            >
              <span
                className={cn(
                  "flex h-3 w-3 shrink-0 items-center justify-center rounded border transition-colors",
                  layer.active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40 bg-transparent"
                )}
                aria-hidden="true"
              >
                {layer.active && <Check className="h-2 w-2 stroke-[3]" />}
              </span>
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  toneFillClass[DOT_TONES[index % DOT_TONES.length]]
                )}
                aria-hidden="true"
              />
              <span className="text-foreground min-w-0 flex-1 truncate text-[11px] font-medium">
                {layer.name}
              </span>
              {layer.count !== undefined && (
                <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                  {layer.count}p
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
