import React from "react";
import { motion } from "framer-motion";
import { Users2, Crown, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type TLFilter = "all" | "italian_tl" | "albanian_tl" | "no_tl";

interface UserFilterTabsProps {
  filter: TLFilter;
  onFilterChange: (filter: TLFilter) => void;
}

export const UserFilterTabs: React.FC<UserFilterTabsProps> = ({ filter, onFilterChange }) => {
  const filters = [
    { key: "all" as TLFilter, label: "All", icon: Users2 },
    { key: "italian_tl" as TLFilter, label: "Italian TL", icon: Crown },
    { key: "albanian_tl" as TLFilter, label: "Albanian TL", icon: Crown },
    { key: "no_tl" as TLFilter, label: "No TL", icon: XCircle },
  ];

  return (
    <div className="flex items-center gap-6 border-b border-border/70">
      <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
        {filters.map((f) => {
          const Icon = f.icon;
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={cn(
                "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="user-filter-tab"
                  className="absolute inset-0 rounded-md bg-primary"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {f.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
