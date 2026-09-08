import React from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface BulkDrawerHeaderProps {
  count: number;
  title: string;
  subtitle: string;
  onClearAndClose: () => void;
}

export const BulkDrawerHeader: React.FC<BulkDrawerHeaderProps> = ({
  count,
  title,
  subtitle,
  onClearAndClose,
}) => (
  <DialogHeader>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {count}
        </div>
        <div className="min-w-0">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <p className="truncate text-sm text-muted-foreground" title={subtitle}>
            {subtitle}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onClearAndClose} className="w-full shrink-0 sm:w-auto">
        <X className="mr-1 h-4 w-4" /> Clear & Close
      </Button>
    </div>
  </DialogHeader>
);
