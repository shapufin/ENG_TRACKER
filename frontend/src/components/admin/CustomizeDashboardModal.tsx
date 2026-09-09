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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Customize Dashboard</DialogTitle>
          <DialogDescription>
            Select which widgets to display on your dashboard. Drag and drop to reorder.
          </DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar max-h-[min(400px,50vh)] min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-1">
          {availableWidgets.map((widget) => (
            <div
              key={widget.id}
              className="flex items-center gap-4 rounded-lg border border-border/60 p-4 transition-colors hover:border-primary/40"
            >
              <Checkbox
                id={widget.id}
                checked={activeWidgets.includes(widget.id)}
                onCheckedChange={() => onToggleWidget(widget.id)}
              />
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-transparent">
                <widget.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <label htmlFor={widget.id} className="cursor-pointer text-sm font-medium">
                  {widget.title}
                </label>
                <p className="text-xs text-muted-foreground">{widget.description}</p>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
