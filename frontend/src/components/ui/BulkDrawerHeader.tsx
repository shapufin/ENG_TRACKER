import React from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
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
        <div
          className="from-accent-violet to-primary text-primary-foreground shadow-accent-violet/25 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br font-mono text-sm font-bold shadow-lg"
          aria-label={`${count} selected`}
        >
          <span aria-hidden="true">
            <AnimatedNumber value={count} duration={0.4} />
          </span>
        </div>
        <div className="min-w-0">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <p className="text-muted-foreground truncate text-sm" title={subtitle}>
            {subtitle}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onClearAndClose}
        className="min-h-11 w-full shrink-0 sm:w-auto"
      >
        <X className="mr-1 h-4 w-4" /> Clear & Close
      </Button>
    </div>
  </DialogHeader>
);
