import React, { useId } from "react";
import { ChevronDown } from "lucide-react";

interface SidebarSectionProps {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  /** Icon-rail mode: a thin divider replaces the header and children always show. */
  collapsed: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible sidebar section shared by the user shell (SidebarNav) and the
 * admin shell (AdminSidebar). The body stays mounted when closed (`hidden`)
 * so plugin-injected links keep their active state and can reopen the section.
 *
 * A section whose links all render nothing for the viewer (e.g. Leadership
 * for pure HR) leaves an empty body and hides its header too.
 */
export const SidebarSection: React.FC<SidebarSectionProps> = ({
  id,
  label,
  open,
  onToggle,
  collapsed,
  children,
}) => {
  const bodyId = useId();

  if (collapsed) {
    return (
      <>
        <li aria-hidden="true" className="border-border/50 my-1 border-t first:hidden" />
        {children}
      </>
    );
  }

  return (
    <li data-sidebar-section={id} className="[&:has(>ul:empty)]:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex h-7 w-full items-center gap-1 rounded-md px-2.5 font-mono text-xs font-bold tracking-[0.14em] uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}
        />
      </button>
      <ul id={bodyId} hidden={!open} className="space-y-0.5 pb-1">
        {children}
      </ul>
    </li>
  );
};
