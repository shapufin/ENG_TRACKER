import type React from "react";
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
