import React from "react";

interface SidebarSectionLabelProps {
  label: string;
}

/** Static mono uppercase section label shared by the user-shell (SidebarNav)
 *  and admin-shell (AdminSidebar) navigation lists. Decorative: rendered
 *  inside `aria-hidden` so the nav landmark's labeled items stay unchanged.
 *  Separation follows the standard sidebar pattern: whitespace is the primary
 *  group separator, the hairline divider is secondary (uxpatterns.dev sidebar
 *  pattern; uxplanet sidebar best practices #8).
 *
 *  A section can be declared by a plugin slot whose links all render nothing
 *  for the viewer (e.g. Leadership for pure HR). The label then sits directly
 *  before the next label/divider (both `aria-hidden`) or at the end of the
 *  list, and hides itself instead of heading an empty group. */
export const SidebarSectionLabel: React.FC<SidebarSectionLabelProps> = ({ label }) => (
  <li
    aria-hidden="true"
    className="border-border/70 mt-4 border-t pt-3 first:mt-0 first:border-t-0 first:pt-0 last:hidden [&:has(+[aria-hidden='true'])]:hidden"
  >
    <span className="text-muted-foreground block px-3 pb-1 font-mono text-xs font-bold tracking-[0.14em] uppercase">
      {label}
    </span>
  </li>
);
