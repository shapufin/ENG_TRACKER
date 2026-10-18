import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./button";
import { AnimatedNumber } from "./AnimatedNumber";
import { X } from "lucide-react";
import { bulkBarEnter, DURATION, useMotionTransition } from "@/lib/motion";

interface BulkAction {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline" | "ghost";
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  actions: BulkAction[];
  entityName?: string;
  /** Optional custom controls (e.g. a select) rendered before the action buttons. */
  children?: React.ReactNode;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  onClear,
  actions,
  entityName = "items",
  children,
}) => {
  const transition = useMotionTransition({ duration: DURATION.base });
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={bulkBarEnter}
          transition={transition}
          className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 sm:w-auto"
        >
          {/*
            Floating bottom bulk-action dock (AdminGUI mockup treatment).
            Uses semantic popover + border + shadow-pop tokens so light and dark
            modes share one elevated dock without shifting table rows.
          */}
          <div
            role="status"
            aria-live="polite"
            className="border-border bg-popover/95 text-popover-foreground shadow-pop flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 supports-[backdrop-filter]:backdrop-blur-md"
          >
            <div className="flex items-center gap-2.5 pr-1">
              <div
                className="from-accent-violet to-primary text-primary-foreground shadow-accent-violet/25 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-linear-to-br font-mono text-xs font-bold shadow-sm"
                aria-label={`${selectedCount} selected`}
              >
                <span aria-hidden="true">
                  <AnimatedNumber value={selectedCount} duration={0.4} />
                </span>
              </div>{" "}
              <span className="text-foreground text-sm font-medium whitespace-nowrap">
                {selectedCount === 1
                  ? `${entityName.replace(/s$/, "")} selected`
                  : `${entityName} selected`}
              </span>
            </div>
            <div className="bg-border hidden h-4 w-px sm:block" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-2">
              {children}
              {actions.map((action, idx) => (
                <Button
                  key={idx}
                  size="sm"
                  variant={action.variant || "default"}
                  onClick={action.onClick}
                  className="gap-1.5"
                  disabled={action.disabled}
                >
                  <action.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {action.label}
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={onClear} className="gap-1.5">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Clear selection
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
