import React, { useState } from "react";
import { Download, LayoutTemplate, MoreHorizontal, RotateCcw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DASHBOARD_PRESETS,
  resolvePresetWidgets,
  type DashboardPreset,
} from "@/config/dashboardPresets";
import { useDashboardPdfExport } from "../hooks/useDashboardPdfExport";

interface DashboardActionsMenuProps {
  /** Element holding the dashboard widgets (PDF capture root). */
  containerRef: React.RefObject<HTMLElement | null>;
  availableWidgets: { id: string; superuserOnly?: boolean }[];
  isSuperuser: boolean;
  /** The saved layout is still loading: nothing here can safely replace it yet. */
  disabled?: boolean;
  /** Receives the resolved, access-filtered widget ids in order. */
  onApplyPreset: (widgetIds: string[]) => void;
  onReset: () => void;
  onCustomize: () => void;
}

/**
 * The admin dashboard's secondary actions behind one labelled menu button, so the header
 * row stays calm. Presets and Reset replace the layout, so both ask before acting.
 */
export const DashboardActionsMenu: React.FC<DashboardActionsMenuProps> = ({
  containerRef,
  availableWidgets,
  isSuperuser,
  disabled = false,
  onApplyPreset,
  onReset,
  onCustomize,
}) => {
  const [pendingPreset, setPendingPreset] = useState<DashboardPreset | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const { exporting, exportPdf } = useDashboardPdfExport(containerRef);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="control"
            className="px-2.5"
            aria-label="Dashboard actions"
            disabled={disabled}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={onCustomize}>
            <Settings className="h-4 w-4" aria-hidden /> Customize dashboard
          </DropdownMenuItem>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2 pt-2">
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden /> Presets
            </DropdownMenuLabel>
            {DASHBOARD_PRESETS.map((p) => (
              <DropdownMenuItem
                key={p.id}
                className="flex-col items-start gap-0"
                onSelect={() => setPendingPreset(p)}
              >
                <span className="text-sm font-medium">{p.label}</span>
                <span className="text-muted-foreground text-xs">{p.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={exporting}
            aria-busy={exporting}
            onSelect={() => void exportPdf()}
          >
            <Download className="h-4 w-4" aria-hidden /> Export PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmReset(true)}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset to default
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={pendingPreset !== null}
        onOpenChange={(next) => {
          if (!next) setPendingPreset(null);
        }}
        title={`Switch to “${pendingPreset?.label ?? ""}”?`}
        description="This replaces the widgets currently on your dashboard. You can switch back at any time."
        confirmLabel="Apply preset"
        onConfirm={() => {
          if (pendingPreset) {
            onApplyPreset(resolvePresetWidgets(pendingPreset, availableWidgets, isSuperuser));
          }
          setPendingPreset(null);
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset dashboard to default?"
        description="This replaces your current widgets with the default layout."
        confirmLabel="Reset layout"
        variant="destructive"
        onConfirm={() => {
          onReset();
          setConfirmReset(false);
        }}
      />
    </>
  );
};
