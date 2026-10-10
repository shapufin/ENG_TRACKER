import React from "react";
import { Users2, Crown, Handshake, UserCog, Shield } from "lucide-react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";

import type { TLFilter } from "@/types";

interface UserFilterTabsProps {
  filter: TLFilter;
  onFilterChange: (filter: TLFilter) => void;
  /** Show the CR Admin tab � only meaningful when the control_room plugin is active. */
  showCRAdmin?: boolean;
}

export const UserFilterTabs: React.FC<UserFilterTabsProps> = ({
  filter,
  onFilterChange,
  showCRAdmin,
}) => {
  const options = [
    { value: "employee" as TLFilter, label: "Employees", icon: Users2 },
    { value: "italian_tl" as TLFilter, label: "Italian TL", icon: Crown },
    { value: "albanian_tl" as TLFilter, label: "Albanian TL", icon: Crown },
    { value: "hbpr" as TLFilter, label: "HBPR", icon: Handshake },
    { value: "hr" as TLFilter, label: "HR", icon: UserCog },
    ...(showCRAdmin ? [{ value: "cr_admin" as TLFilter, label: "CR Admin", icon: Shield }] : []),
  ];

  return (
    <FilterChipRow label="Role" options={options} selected={[filter]} onToggle={onFilterChange} />
  );
};
