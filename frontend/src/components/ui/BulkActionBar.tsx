import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "./GlassCard";
import { Button } from "./button";
import { X } from "lucide-react";

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
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  onClear,
  actions,
  entityName = "items",
}) => {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <GlassCard
            isHoverLift={false}
            className="mb-4 overflow-hidden border-l-4 border-l-primary"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {selectedCount}
                </div>
                <span className="text-sm font-medium">
                  {selectedCount === 1
                    ? `${entityName.replace(/s$/, "")} selected`
                    : `${entityName} selected`}
                </span>
              </div>
              <div className="flex items-center gap-2">
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
                <div className="mx-1 h-4 w-px bg-border" />
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
