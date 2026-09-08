/** Custom React Flow node for the org chart. */
import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoleBadge } from "../types";

export interface OrgNodeData extends Record<string, unknown> {
  nodeType: "person" | "tech";
  label: string;
  subtitle?: string;
  roleBadge?: RoleBadge;
  hasChildren?: boolean;
  collapsed?: boolean;
  loading?: boolean;
  highlighted?: boolean;
}

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
  employee: "Employee",
};

export const OrgNode: React.FC<NodeProps> = ({ data }) => {
  const nodeData = data as unknown as OrgNodeData;
  const isTech = nodeData.nodeType === "tech";
  const hasChildren = nodeData.hasChildren;
  const collapsed = nodeData.collapsed;
  const loading = nodeData.loading;
  const highlighted = nodeData.highlighted;

  return (
    <div
      className={cn(
        "cursor-pointer rounded-lg border px-4 py-2 transition-shadow",
        isTech
          ? "border-dashed border-muted-foreground/40 bg-muted/50 shadow-sm hover:shadow-md"
          : "border-border bg-card shadow-md shadow-primary/10 hover:shadow-lg hover:shadow-primary/20",
        highlighted && "ring-2 ring-yellow-400 ring-offset-1"
      )}
      role="treeitem"
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-label={`${nodeData.label}${nodeData.roleBadge ? `, ${ROLE_BADGE_LABELS[nodeData.roleBadge]}` : ""}${nodeData.subtitle ? `, ${nodeData.subtitle}` : ""}`}
      tabIndex={0}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          {hasChildren && (
            <span className="text-muted-foreground" aria-hidden="true">
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : collapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </span>
          )}
          <span className="text-sm font-medium">{nodeData.label}</span>
        </div>
        {nodeData.subtitle && (
          <span className="text-xs text-muted-foreground">{nodeData.subtitle}</span>
        )}
        {nodeData.roleBadge && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              ROLE_BADGE_STYLES[nodeData.roleBadge]
            )}
            aria-label={`Role: ${ROLE_BADGE_LABELS[nodeData.roleBadge]}`}
          >
            {ROLE_BADGE_LABELS[nodeData.roleBadge]}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};
