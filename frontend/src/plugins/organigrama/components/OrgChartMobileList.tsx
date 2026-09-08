/** Mobile fallback: collapsible nested list for screens < 768px. */
import React, { useState, useCallback } from "react";
import { Users, User, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TreeNode, RoleBadge } from "../types";

const ROLE_BADGE_STYLES: Record<RoleBadge, string> = {
  italian_tl: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  albanian_tl: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  hr: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  admin: "bg-red-100 text-red-700 dark:bg-rose-500/15 dark:text-rose-300",
  employee: "bg-muted text-muted-foreground",
};

const ROLE_BADGE_LABELS: Record<RoleBadge, string> = {
  italian_tl: "IT TL",
  albanian_tl: "AL TL",
  hr: "HR",
  admin: "Admin",
  employee: "",
};

const MobileNode: React.FC<{ node: TreeNode; depth: number }> = ({ node, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const isTech = node.type === "tech";
  const label = isTech ? node.name : node.full_name || node.username;
  const subtitle = isTech ? node.code : undefined;
  const hasChildren = node.children.length > 0;

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined} aria-level={depth + 1}>
      <div
        className="flex items-center gap-2 py-1.5"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={toggle}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        {isTech ? (
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-sm">{label}</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        {node.role_badge && ROLE_BADGE_LABELS[node.role_badge] && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              ROLE_BADGE_STYLES[node.role_badge]
            )}
            aria-label={`Role: ${ROLE_BADGE_LABELS[node.role_badge]}`}
          >
            {ROLE_BADGE_LABELS[node.role_badge]}
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <ul role="group">
          {node.children.map((child) => (
            <MobileNode key={`${child.type}-${child.id}`} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
};

export const OrgChartMobileList: React.FC<{ roots: TreeNode[] }> = ({ roots }) => {
  if (roots.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No organizational data available.
      </div>
    );
  }

  return (
    <ul role="tree" aria-label="Organizational chart (mobile list view)" className="divide-y">
      {roots.map((root) => (
        <MobileNode key={`${root.type}-${root.id}`} node={root} depth={0} />
      ))}
    </ul>
  );
};
