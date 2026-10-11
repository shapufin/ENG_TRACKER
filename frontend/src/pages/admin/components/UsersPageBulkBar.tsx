import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { bulkBarEnter, DURATION, useMotionTransition } from "@/lib/motion";

interface UsersPageBulkBarProps {
  selectedCount: number;
  onClear: () => void;
  onBulkActions: () => void;
  onDelete?: () => void;
}

export const UsersPageBulkBar: React.FC<UsersPageBulkBarProps> = ({
  selectedCount,
  onClear,
  onBulkActions,
  onDelete,
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
          className="overflow-hidden"
        >
          {/*
            Same flat selection strip as the shared BulkActionBar (2026-10-10
            refinement): one quiet band, not a tinted card floating above the table.
          */}
          <div
            className="border-line-subtle flex flex-col gap-2 rounded-lg border bg-muted/40 px-4 py-2 sm:flex-row sm:items-center sm:justify-between"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-3">
              <div
                className="from-accent-violet to-primary text-primary-foreground shadow-accent-violet/25 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-xs font-bold shadow-sm"
                aria-label={`${selectedCount} users selected`}
              >
                <span aria-hidden="true">
                  <AnimatedNumber value={selectedCount} duration={0.4} />
                </span>
              </div>
              <span className="text-sm font-medium">
                {selectedCount} user{selectedCount > 1 ? "s" : ""} selected
              </span>
            </div>
            <div className={`grid gap-2 ${onDelete ? "grid-cols-3" : "grid-cols-2"} sm:flex`}>
              <Button variant="outline" size="sm" onClick={onClear} className="w-full sm:w-auto">
                Clear selection
              </Button>
              <Button size="sm" onClick={onBulkActions} className="w-full sm:w-auto">
                Bulk edit
              </Button>
              {onDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDelete}
                  className="w-full sm:w-auto"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
