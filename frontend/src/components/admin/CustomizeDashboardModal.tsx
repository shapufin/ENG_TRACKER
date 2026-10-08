import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ADMIN_DASHBOARD_SECTIONS, widgetSection } from "@/config/dashboardWidgets";

interface CustomizeDashboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableWidgets: Array<{
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
  activeWidgets: string[];
  onToggleWidget: (widgetId: string) => void;
}

export const CustomizeDashboardModal: React.FC<CustomizeDashboardModalProps> = ({
  open,
  onOpenChange,
  availableWidgets,
  activeWidgets,
  onToggleWidget,
}) => {
  const groups = [
    ...ADMIN_DASHBOARD_SECTIONS.map((sec) => ({
      label: sec.label,
      widgets: availableWidgets.filter((w) => widgetSection(w.id) === sec.id),
    })),
    { label: "Other", widgets: availableWidgets.filter((w) => !widgetSection(w.id)) },
  ].filter((g) => g.widgets.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Customize Dashboard</DialogTitle>
          <DialogDescription>
            Choose which widgets appear on your dashboard. Changes apply immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar max-h-[min(400px,50vh)] min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-1">
          {groups.map((group) => (
            <section key={group.label} role="group" aria-label={group.label} className="space-y-3">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {group.label}
              </h3>
              {group.widgets.map((widget) => (
                <div
                  key={widget.id}
                  className="border-border/60 hover:border-primary/40 flex items-center gap-4 rounded-lg border p-4 transition-colors"
                >
                  <Checkbox
                    id={widget.id}
                    checked={activeWidgets.includes(widget.id)}
                    onCheckedChange={() => onToggleWidget(widget.id)}
                  />
                  <div className="from-primary/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br to-transparent">
                    <widget.icon className="text-primary h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <label htmlFor={widget.id} className="cursor-pointer text-sm font-medium">
                      {widget.title}
                    </label>
                    <p className="text-muted-foreground text-xs">{widget.description}</p>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
        <DialogFooter className="shrink-0 border-t pt-4">
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
