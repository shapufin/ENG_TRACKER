import React from "react";
import { Users2, Crown, Handshake, UserCog, Shield } from "lucide-react";
import { Chip } from "@/components/ui/Chip";

import type { TLFilter } from "@/types";

interface UserFilterTabsProps {
  filter: TLFilter;
  onFilterChange: (filter: TLFilter) => void;
  /** Show the CR Admin tab — only meaningful when the control_room plugin is active. */
  showCRAdmin?: boolean;
}

/** Role chips (single choice). Rendered inside a `FacetRow` by the page. */
export const UserFilterTabs: React.FC<UserFilterTabsProps> = ({
  filter,
  onFilterChange,
  showCRAdmin,
}) => {
  const filters = [
    { key: "employee" as TLFilter, label: "Employees", icon: Users2 },
    { key: "italian_tl" as TLFilter, label: "Italian TL", icon: Crown },
    { key: "albanian_tl" as TLFilter, label: "Albanian TL", icon: Crown },
    { key: "hbpr" as TLFilter, label: "HBPR", icon: Handshake },
    { key: "hr" as TLFilter, label: "HR", icon: UserCog },
    ...(showCRAdmin ? [{ key: "cr_admin" as TLFilter, label: "CR Admin", icon: Shield }] : []),
  ];

  return (
    <>
      {filters.map((f) => {
        const Icon = f.icon;
        return (
          <Chip key={f.key} pressed={filter === f.key} onClick={() => onFilterChange(f.key)}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {f.label}
          </Chip>
        );
      })}
    </>
  );
};
