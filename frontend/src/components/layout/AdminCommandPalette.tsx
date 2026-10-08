import React from "react";
import { CommandPalette } from "./CommandPalette";
import type { AdminNavItem } from "./hooks/useAdminNavItems";

interface AdminCommandPaletteProps {
  /** Already filtered by role, CR scope and active plugins (useAdminNavItems). */
  items: AdminNavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: number;
}

/** Admin palette: pages the viewer can open, recents, and server-scoped user search. */
export const AdminCommandPalette: React.FC<AdminCommandPaletteProps> = (props) => (
  <CommandPalette {...props} userSearch searchLabel="Search admin pages" />
);
