/**
 * CRUsersFilterButton — toggle button for filtering to Control Room users.
 *
 * Extracted from UsersPageContent.tsx where the same 24-line button was
 * duplicated in both the CR-only-admin and full-admin branches.
 */
import React from "react";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  active: boolean;
  onToggle: () => void;
}

export const CRUsersFilterButton: React.FC<Props> = ({ active, onToggle }) => (
  <button
    onClick={onToggle}
    className={cn(
      "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    )}
    title="Filter to Control Room users only"
  >
    <Shield className="h-3.5 w-3.5" />
    CR Users
    {active && (
      <motion.div
        layoutId="cr-filter-tab"
        className="absolute inset-0 -z-10 rounded-md bg-primary"
        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
      />
    )}
  </button>
);
