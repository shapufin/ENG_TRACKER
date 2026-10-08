import React, { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DASHBOARD_PRESETS,
  resolvePresetWidgets,
  type DashboardPreset,
} from "@/config/dashboardPresets";

interface DashboardPresetMenuProps {
  availableWidgets: { id: string; superuserOnly?: boolean }[];
  isSuperuser: boolean;
  /** Receives the resolved, access-filtered widget ids in order. */
  onApply: (widgetIds: string[]) => void;
}

/** Pick a named widget set; replacing the current layout always asks first. */
export const DashboardPresetMenu: React.FC<DashboardPresetMenuProps> = ({
  availableWidgets,
  isSuperuser,
  onApply,
}) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DashboardPreset | null>(null);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <LayoutTemplate className="mr-2 h-4 w-4" aria-hidden /> Presets
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1">
          <div role="menu" aria-label="Dashboard presets">
            {DASHBOARD_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className="hover:bg-accent focus-visible:bg-accent w-full rounded-md px-3 py-2 text-left"
                onClick={() => {
                  setPending(p);
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="text-muted-foreground block text-xs">{p.description}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={`Switch to “${pending?.label ?? ""}”?`}
        description="This replaces the widgets currently on your dashboard. You can switch back at any time."
        confirmLabel="Apply preset"
        onConfirm={() => {
          if (pending) onApply(resolvePresetWidgets(pending, availableWidgets, isSuperuser));
          setPending(null);
        }}
      />
    </>
  );
};
