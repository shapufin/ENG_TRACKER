import React from "react";

interface SidebarSectionLabelProps {
  label: string;
}

/** Static mono uppercase section label shared by the user-shell (SidebarNav)
 *  and admin-shell (AdminSidebar) navigation lists. Decorative: rendered
 *  inside `aria-hidden` so the nav landmark's labeled items stay unchanged. */
export const SidebarSectionLabel: React.FC<SidebarSectionLabelProps> = ({ label }) => (
  <li aria-hidden="true">
    <span className="block px-3 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
  </li>
);
