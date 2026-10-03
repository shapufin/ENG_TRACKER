import React from "react";
import { motion } from "framer-motion";
import { Users2, Crown, Handshake, UserCog, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAYOUT_ID, useMotionTransition } from "@/lib/motion";

/** The Admin Users role-tab filter. Single declaration — `useUsersPage`
 * imports this rather than redeclaring the union. */
export type TLFilter = "employee" | "italian_tl" | "albanian_tl" | "hbpr" | "hr" | "cr_admin";

interface UserFilterTabsProps {
  filter: TLFilter;
  onFilterChange: (filter: TLFilter) => void;
  /** Show the CR Admin tab — only meaningful when the control_room plugin is active. */
  showCRAdmin?: boolean;
}

export const UserFilterTabs: React.FC<UserFilterTabsProps> = ({
  filter,
  onFilterChange,
  showCRAdmin,
}) => {
  const transition = useMotionTransition({ type: "spring", bounce: 0.2, duration: 0.6 });
  const filters = [
    { key: "employee" as TLFilter, label: "Employees", icon: Users2 },
    { key: "italian_tl" as TLFilter, label: "Italian TL", icon: Crown },
    { key: "albanian_tl" as TLFilter, label: "Albanian TL", icon: Crown },
    { key: "hbpr" as TLFilter, label: "HBPR", icon: Handshake },
    { key: "hr" as TLFilter, label: "HR", icon: UserCog },
    ...(showCRAdmin ? [{ key: "cr_admin" as TLFilter, label: "CR Admin", icon: Shield }] : []),
  ];

  return (
    <div className="border-border/70 flex items-center gap-6 border-b">
      <div className="bg-muted/50 flex items-center gap-1 rounded-lg p-1">
        {filters.map((f) => {
          const Icon = f.icon;
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              aria-pressed={isActive}
              className={cn(
                "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId={LAYOUT_ID.userFilterTab}
                  className="bg-primary absolute inset-0 rounded-md"
                  transition={transition}
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
