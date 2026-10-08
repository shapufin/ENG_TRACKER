import type React from "react";
import type { UserProfile, TLFilter } from "@/types";
import type { NavItem } from "./hooks/useVisibleNavItems";
import { NAV_SECTION_LABELS } from "./hooks/useVisibleNavItems";

export interface PaletteItem {
  path: string;
  label: string;
  group: string;
  icon: React.ElementType;
}

export const navItemToPaletteItem = (i: NavItem): PaletteItem => ({
  path: i.path,
  label: i.label,
  icon: i.icon,
  group: NAV_SECTION_LABELS[i.section],
});

/** Users-page role tab that contains this person; the default tab holds plain employees only. */
export const userRoleTab = (p: UserProfile): TLFilter =>
  p.is_albanian_tl_role
    ? "albanian_tl"
    : p.is_italian_tl_role
      ? "italian_tl"
      : p.is_hr_user
        ? "hr"
        : p.user?.roles?.includes("hbpr")
          ? "hbpr"
          : p.user?.is_cr_admin
            ? "cr_admin"
            : "employee";
