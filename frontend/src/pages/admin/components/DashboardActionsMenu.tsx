import React, { useRef, useState } from "react";
import { Download, LayoutTemplate, MoreHorizontal, RotateCcw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DASHBOARD_PRESETS,
  resolvePresetWidgets,
  type DashboardPreset,
} from "@/config/dashboardPresets";
import { cn } from "@/lib/utils";
import { useDashboardPdfExport } from "../hooks/useDashboardPdfExport";

interface DashboardActionsMenuProps {
  /** Element holding the dashboard widgets (PDF capture root). */
  containerRef: React.RefObject<HTMLElement | null>;
  availableWidgets: { id: string; superuserOnly?: boolean }[];
  isSuperuser: boolean;
  /** Receives the resolved, access-filtered widget ids in order. */
  onApplyPreset: (widgetIds: string[]) => void;
  onReset: () => void;
  onCustomize: () => void;
}

const itemClass =
  "hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-hidden disabled:pointer-events-none disabled:opacity-50";

/**
 * The admin dashboard's secondary actions behind one labelled menu button, so the header
 * row stays calm. Presets and Reset replace the layout, so both ask before acting.
 */
export const DashboardActionsMenu: React.FC<DashboardActionsMenuProps> = ({
  containerRef,
  availableWidgets,
  isSuperuser,
  onApplyPreset,
  onReset,
  onCustomize,
}) => {
  const [open, setOpen] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<DashboardPreset | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { exporting, exportPdf } = useDashboardPdfExport(containerRef);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = (at + 1) % list.length;
    else if (e.key === "ArrowUp") next = (at - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    if (next === null) return;
    e.preventDefault();
    list[next].focus();
  };

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="control"
            className="px-2.5"
            aria-label="Dashboard actions"
            aria-haspopup="menu"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72 p-1"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            items()[0]?.focus();
          }}
        >
          <div
            ref={menuRef}
            role="menu"
            aria-label="Dashboard actions"
            onKeyDown={onMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={itemClass}
              onClick={run(onCustomize)}
            >
              <Settings className="h-4 w-4" aria-hidden /> Customize dashboard
            </button>
            <div role="group" aria-label="Presets">
              <p className="text-muted-foreground flex items-center gap-2 px-3 pt-2 pb-1 text-xs font-medium">
                <LayoutTemplate className="h-3.5 w-3.5" aria-hidden /> Presets
              </p>
              {DASHBOARD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={cn(itemClass, "flex-col items-start gap-0")}
                  onClick={run(() => setPendingPreset(p))}
                >
                  <span className="text-sm font-medium">{p.label}</span>
                  <span className="text-muted-foreground text-xs">{p.description}</span>
                </button>
              ))}
            </div>
            <div className="border-line-subtle my-1 border-t" role="separator" />
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={itemClass}
              disabled={exporting}
              aria-busy={exporting}
              onClick={run(() => void exportPdf())}
            >
              <Download className="h-4 w-4" aria-hidden /> Export PDF
            </button>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={itemClass}
              onClick={run(() => setConfirmReset(true))}
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset to default
            </button>
          </div>
        </PopoverContent>
      </Popover>
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
