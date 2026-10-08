import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "./GlassCard";
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
        >
          <GlassCard className="border-l-primary mb-4 overflow-hidden border-l-4">
            <div className="bg-primary/5 flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <div
                  className="from-accent-violet to-primary text-primary-foreground shadow-accent-violet/25 flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-br text-xs font-bold shadow-sm"
                  aria-label={`${selectedCount} selected`}
                >
                  <span aria-hidden="true">
                    <AnimatedNumber value={selectedCount} duration={0.4} />
                  </span>
                </div>
                <span className="text-sm font-medium">
                  {selectedCount === 1
                    ? `${entityName.replace(/s$/, "")} selected`
                    : `${entityName} selected`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {children}
                {actions.map((action, idx) => (
                  <Button
                    key={idx}
                    size="sm"
                    variant={action.variant || "default"}
                    onClick={action.onClick}
                    className="h-7 px-2 text-xs"
                    disabled={action.disabled}
                  >
                    <action.icon className="mr-1 h-3.5 w-3.5" />
                    {action.label}
                  </Button>
                ))}
                <div className="bg-border mx-1 h-4 w-px" />
                <Button size="sm" variant="ghost" onClick={onClear} className="h-7 px-2 text-xs">
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
