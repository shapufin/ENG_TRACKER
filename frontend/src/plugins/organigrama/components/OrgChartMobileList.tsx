/** Mobile fallback: collapsible nested list for screens < 768px. */
import React, { useState, useCallback } from "react";
import {
  Users,
  User,
  ChevronRight,
  ChevronDown,
  Network,
  ChevronsUpDown,
  ChevronsDownUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TreeNode, RoleBadge } from "../types";

const ROLE_BADGE_STYLES: Record<RoleBadge, string> = {
  italian_tl: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", // ds-allow-hardcode: matches OrgNode.tsx
  albanian_tl: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300", // ds-allow-hardcode: matches OrgNode.tsx
  hr: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", // ds-allow-hardcode: matches OrgNode.tsx
  admin: "bg-red-100 text-red-700 dark:bg-rose-500/15 dark:text-rose-300", // ds-allow-hardcode: matches OrgNode.tsx
  employee: "bg-muted text-muted-foreground",
};

const ROLE_BADGE_LABELS: Record<RoleBadge, string> = {
  italian_tl: "IT TL",
  albanian_tl: "AL TL",
  hr: "HR",
  admin: "Admin",
  employee: "",
};

function getAllParentPathIds(roots: TreeNode[], pathPrefix?: string): Set<string> {
  const result = new Set<string>();
  function collect(node: TreeNode, currentPrefix?: string) {
    const rawId = `${node.type}-${node.id}`;
    const nodeId = currentPrefix ? `${currentPrefix}__${rawId}` : rawId;
    if (node.children.length > 0) {
      result.add(nodeId);
      for (const child of node.children) {
        collect(child, nodeId);
      }
    }
  }
  for (const root of roots) {
    collect(root, pathPrefix);
  }
  return result;
}

const MobileNode: React.FC<{
  node: TreeNode;
  depth: number;
  pathPrefix?: string;
  collapsedNodes: Set<string>;
  onToggle: (id: string) => void;
}> = ({ node, depth, pathPrefix, collapsedNodes, onToggle }) => {
  const isTech = node.type === "tech";
  const label = isTech ? node.name : node.full_name || node.username;
  const subtitle = isTech ? node.code : undefined;
  const hasChildren = node.children.length > 0;
  const rawId = `${node.type}-${node.id}`;
  const nodeId = pathPrefix ? `${pathPrefix}__${rawId}` : rawId;
  const isCollapsed = collapsedNodes.has(nodeId);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle(nodeId);
    },
    [nodeId, onToggle]
  );

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      aria-level={depth + 1}
    >
      <div
        className="flex items-center gap-2 py-1.5"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={toggle}
            className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5"
            aria-label={!isCollapsed ? "Collapse" : "Expand"}
          >
            {!isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        {isTech ? (
          <Users className="text-muted-foreground h-4 w-4 shrink-0" />
        ) : (
          <User className="text-muted-foreground h-4 w-4 shrink-0" />
        )}
        <span className="flex-1 text-sm">{label}</span>
        {subtitle && <span className="text-muted-foreground text-xs">{subtitle}</span>}
        {node.role_badge && ROLE_BADGE_LABELS[node.role_badge] && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              ROLE_BADGE_STYLES[node.role_badge]
            )}
            aria-label={`Role: ${ROLE_BADGE_LABELS[node.role_badge]}`}
          >
            {ROLE_BADGE_LABELS[node.role_badge]}
          </span>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <ul role="group">
          {node.children.map((child) => (
            <MobileNode
              key={`${nodeId}__${child.type}-${child.id}`}
              node={child}
              depth={depth + 1}
              pathPrefix={nodeId}
              collapsedNodes={collapsedNodes}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const OrgChartMobileList: React.FC<{
  roots: TreeNode[];
  onSwitchToGraph?: () => void;
}> = ({ roots, onSwitchToGraph }) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const handleExpandAll = useCallback(() => {
    setCollapsedNodes(new Set());
  }, []);

  const handleCollapseAll = useCallback(() => {
    setCollapsedNodes(getAllParentPathIds(roots));
  }, [roots]);

  const handleToggle = useCallback((id: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (roots.length === 0) {
    return (
      <div className="text-muted-foreground px-4 py-8 text-center text-sm">
        No organizational data available.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            aria-label="Expand all nodes"
            title="Expand all"
            className="h-7 px-2 text-xs"
          >
            <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
            <span>Expand All</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            aria-label="Collapse all nodes"
            title="Collapse all"
            className="h-7 px-2 text-xs"
          >
            <ChevronsDownUp className="mr-1 h-3.5 w-3.5" />
            <span>Collapse All</span>
          </Button>
        </div>
        {onSwitchToGraph && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSwitchToGraph}
            className="h-7 gap-1.5 px-2 text-xs font-medium"
            title="Switch to interactive graph canvas with zoom & pan"
            aria-label="Switch to graph view"
          >
            <Network className="text-primary h-3.5 w-3.5" />
            <span>Interactive Graph</span>
          </Button>
        )}
      </div>
      <ul role="tree" aria-label="Organizational chart (mobile list view)" className="divide-y">
        {roots.map((root) => (
          <MobileNode
            key={`${root.type}-${root.id}`}
            node={root}
            depth={0}
            collapsedNodes={collapsedNodes}
            onToggle={handleToggle}
          />
        ))}
      </ul>
    </div>
  );
};
