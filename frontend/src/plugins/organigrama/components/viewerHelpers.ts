import type { OrgChartNode, OrgChartEdge, TreeNode } from "../types";

/**
 * Build a parent-to-child mapping from explicit hierarchy edges and group containment.
 * Explicit hierarchy edges take precedence over visual group membership.
 */
export function buildParentMap(nodes: OrgChartNode[], edges: OrgChartEdge[]): Map<string, string> {
  const parentMap = new Map<string, string>();
  const nodeIds = new Set(nodes.map((node) => node.node_uuid));
  for (const e of edges) {
    if (e.edge_type === "reports_to" || e.edge_type === "contains") {
      if (!parentMap.has(e.target_uuid)) {
        parentMap.set(e.target_uuid, e.source_uuid);
      }
    }
  }
  for (const node of nodes) {
    if (!parentMap.has(node.node_uuid) && node.group_uuid && nodeIds.has(node.group_uuid)) {
      parentMap.set(node.node_uuid, node.group_uuid);
    }
  }
  return parentMap;
}

/** Check if a node matches the search query (case-insensitive). */
export function nodeMatches(node: OrgChartNode, query: string): boolean {
  const q = query.toLowerCase();
  return (
    node.display_name.toLowerCase().includes(q) ||
    (node.role_title ?? "").toLowerCase().includes(q) ||
    (node.department_label ?? "").toLowerCase().includes(q) ||
    (node.subtitle ?? "").toLowerCase().includes(q)
  );
}

/**
 * Filter the hierarchy to matching nodes + their ancestors.
 * Returns the pruned node list and the set of matching + ancestor UUIDs.
 * Mirrors the live chart's filterTree behavior for parity.
 */
export function filterHierarchy(
  nodes: OrgChartNode[],
  edges: OrgChartEdge[],
  query: string
): { filteredNodes: OrgChartNode[]; visibleIds: Set<string> } {
  const q = query.toLowerCase().trim();
  if (!q) return { filteredNodes: nodes, visibleIds: new Set(nodes.map((n) => n.node_uuid)) };

  const parentMap = buildParentMap(nodes, edges);

  const matchIds = new Set<string>();
  for (const n of nodes) {
    if (nodeMatches(n, q)) matchIds.add(n.node_uuid);
  }

  // Preserve ancestors of matches
  const visibleIds = new Set<string>(matchIds);
  for (const id of matchIds) {
    let current = parentMap.get(id);
    while (current && !visibleIds.has(current)) {
      visibleIds.add(current);
      current = parentMap.get(current);
    }
  }

  const filteredNodes = nodes.filter((n) => visibleIds.has(n.node_uuid));
  return { filteredNodes, visibleIds };
}

/** Generate 1-2 letter initials from a display name or label. Safe for null/empty/single-word inputs. */
export function getInitials(name?: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Semantic color accents for custom node styling. */
export const COLOR_ACCENT_CLASSES: Record<string, string> = {
  blue: "border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-950/20",
  emerald: "border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20",
  purple: "border-purple-300 dark:border-purple-700 bg-purple-50/60 dark:bg-purple-950/20",
  amber: "border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20",
  rose: "border-rose-300 dark:border-rose-700 bg-rose-50/60 dark:bg-rose-950/20",
  cyan: "border-cyan-300 dark:border-cyan-700 bg-cyan-50/60 dark:bg-cyan-950/20",
  slate: "border-slate-300 dark:border-slate-600 bg-slate-50/60 dark:bg-slate-900/30",
};

/** Geometric silhouettes for organigrama nodes. */
export const SHAPE_GEOMETRY_CLASSES: Record<string, string> = {
  rounded: "rounded-lg",
  pill: "rounded-full px-3",
  sharp: "rounded-none",
  soft: "rounded-2xl",
  leaf: "rounded-tr-2xl rounded-bl-2xl rounded-tl-sm rounded-br-sm",
  chamfered:
    "rounded-none [clip-path:polygon(14px_0,calc(100%-14px)_0,100%_14px,100%_calc(100%-14px),calc(100%-14px)_100%,14px_100%,0_calc(100%-14px),0_14px)]",
};

/** Border styles for organigrama nodes. */
export const BORDER_STYLE_CLASSES: Record<string, string> = {
  solid: "border-solid",
  dashed: "border-dashed !border-2",
  dotted: "border-dotted !border-2",
  double: "border-double !border-4",
  glow: "border-solid ring-2 ring-primary/40 shadow-lg shadow-primary/20",
};

/**
 * Capture a React Flow canvas container viewport and download it as a high-DPI PNG image.
 */
export async function exportCanvasToPng(
  container: HTMLElement | null,
  filename: string
): Promise<boolean> {
  if (!container) return false;
  const viewport = container.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!viewport) return false;
  try {
    const { default: html2canvas } = await import("html2canvas-pro");
    const canvas = await html2canvas(viewport, {
      backgroundColor: null,
      scale: 2,
      logging: false,
    });
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
    return true;
  } catch {
    return false;
  }
}

/** Distinct Albanian TLs in a live tree, sorted by name (a bridging TL repeats under several roots). */
export function collectAlbanianTls(roots: TreeNode[]): { id: number; name: string }[] {
  const found = new Map<number, string>();
  const visit = (node: TreeNode) => {
    if (node.type === "person" && node.role_badge === "albanian_tl") {
      found.set(node.id, node.full_name || node.username || "Unknown");
    }
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return [...found]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Narrow a live tree to the branch of one Albanian TL, keeping the Italian TL above. */
export function filterByAlbanianTl(roots: TreeNode[], tlId: number): TreeNode[] {
  const visit = (node: TreeNode): TreeNode | null => {
    if (node.type === "person" && node.role_badge === "albanian_tl") {
      return node.id === tlId ? node : null;
    }
    const children = node.children.map(visit).filter((c): c is TreeNode => c !== null);
    return children.length ? { ...node, children } : null;
  };
  return roots.map(visit).filter((r): r is TreeNode => r !== null);
}
