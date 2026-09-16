import React from "react";

interface SidebarSectionLabelProps {
  label: string;
}

/** Static mono uppercase section label shared by the user-shell (SidebarNav)
 *  and admin-shell (AdminSidebar) navigation lists. Decorative: rendered
 *  inside `aria-hidden` so the nav landmark's labeled items stay unchanged.
 *  Separation follows the standard sidebar pattern: whitespace is the primary
 *  group separator, the hairline divider is secondary (uxpatterns.dev sidebar
 *  pattern; uxplanet sidebar best practices #8). */
export const SidebarSectionLabel: React.FC<SidebarSectionLabelProps> = ({ label }) => (
  <li
    aria-hidden="true"
    className="mt-5 border-t border-border/70 pt-4 first:mt-0 first:border-t-0 first:pt-0"
  >
    <span className="block px-3 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </span>
  </li>
);
