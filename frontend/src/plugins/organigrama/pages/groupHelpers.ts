/** Pure coordinate helpers for builder group/ungroup operations.
 *
 * These are extracted from OrganigramaBuilderPage so the coordinate math is
 * unit-testable independently of React Flow component state. The key invariant:
 * React Flow stores a child node's position relative to its parentId. When
 * grouping nodes that may already be nested, we must resolve absolute
 * positions first, then re-base to the new group's coordinates.
 */
import type { Node, Edge } from "@xyflow/react";
import type { BuilderNodeData, ShapeType } from "../types";
import { CONTAINER_SHAPE_TYPE_SET } from "../generatedMeta";

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 80;

/**
 * Container shapes that may serve as a visual group target. Re-exported from
 * the generated metadata so the builder's deletion re-parenting guard stays
 * in sync with the backend ``CONTAINER_SHAPE_TYPES`` allowlist without
 * hand-maintained duplication.
 */
export const CONTAINER_SHAPE_TYPES = CONTAINER_SHAPE_TYPE_SET;

/** True if a node is a visual container (group) by shape. */
export function isContainerNode(node: Node): boolean {
  const data = node.data as unknown as BuilderNodeData | undefined;
  return !!data && CONTAINER_SHAPE_TYPES.has(data.shape_type);
}

export function nodeLayoutProps(shape: ShapeType, width: number, height: number): Partial<Node> {
  if (CONTAINER_SHAPE_TYPES.has(shape)) {
    return {
      style: { width, height },
      zIndex: 0,
      dragHandle: ".builder-group-drag-handle",
    };
  }
  return { width, height };
}

/**
 * Resolve a node's absolute canvas position by walking up the parentId chain.
 * If a parent is missing from the nodes array (dangling parentId), the node's
 * own position is returned as-is.
 */
export function resolveAbsolutePosition(node: Node, allNodes: Node[]): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  const idToNode = new Map(allNodes.map((n) => [n.id, n]));
  let currentId = node.parentId;
  const visited = new Set<string>([node.id]);
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parent = idToNode.get(currentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    currentId = parent.parentId;
  }
  return { x, y };
}

export function orderNodesParentFirst(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, Node[]>();
  const roots: Node[] = [];

  for (const node of nodes) {
    if (node.parentId && byId.has(node.parentId)) {
      const children = childrenByParent.get(node.parentId) ?? [];
      children.push(node);
      childrenByParent.set(node.parentId, children);
    } else {
      roots.push(node);
    }
  }

  const ordered: Node[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: Node) => {
    if (visited.has(node.id) || visiting.has(node.id)) return;
    visiting.add(node.id);
    ordered.push(node);
    for (const child of childrenByParent.get(node.id) ?? []) visit(child);
    visiting.delete(node.id);
    visited.add(node.id);
  };

  for (const root of roots) visit(root);
  for (const node of nodes) visit(node);
  return ordered;
}

/**
 * Compute the bounding box of a set of nodes using their absolute positions.
 * Pass `allNodes` so nested nodes' positions can be resolved.
 */
export function computeGroupBounds(
  selectedNodes: Node[],
  allNodes: Node[] = selectedNodes
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of selectedNodes) {
    const abs = resolveAbsolutePosition(n, allNodes);
    const w = nodeWidth(n);
    const h = nodeHeight(n);
    minX = Math.min(minX, abs.x);
    minY = Math.min(minY, abs.y);
    maxX = Math.max(maxX, abs.x + w);
    maxY = Math.max(maxY, abs.y + h);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Re-base a node's position to be relative to a new group's position.
 * The node's absolute position is resolved first, then the group position is
 * subtracted. The parentId and extent are set to the new group.
 */
export function rebaseNodeToGroup(
  node: Node,
  allNodes: Node[],
  groupId: string,
  groupPos: { x: number; y: number }
): Node {
  const abs = resolveAbsolutePosition(node, allNodes);
  return {
    ...node,
    position: { x: abs.x - groupPos.x, y: abs.y - groupPos.y },
    parentId: groupId,
    extent: "parent" as const,
  };
}

const DUPLICATE_OFFSET = 40;

/**
 * Duplicate a set of nodes with new IDs and an offset.
 * Duplicated nodes are unparented (placed at absolute coordinates + offset)
 * so they don't inherit the original's group membership — the user can
 * re-group them deliberately. Pass `allNodes` so nested nodes' positions
 * can be resolved to absolute before applying the offset.
 */
export function duplicateNodes(
  nodes: Node[],
  generateId: () => string,
  allNodes: Node[] = nodes
): Node[] {
  return nodes.map((node) => {
    const abs = resolveAbsolutePosition(node, allNodes);
    return {
      ...node,
      id: generateId(),
      position: { x: abs.x + DUPLICATE_OFFSET, y: abs.y + DUPLICATE_OFFSET },
      parentId: undefined,
      extent: undefined,
      selected: false,
    };
  });
}

/**
 * Duplicate edges that connect duplicated nodes.
 *
 * Given the original edges and a map from original node ID → duplicated node
 * ID, returns new edges for every edge where BOTH source and target were
 * duplicated. Edges to non-duplicated nodes are skipped (they would dangle).
 * Edge type, style, className, label, and data are preserved; only the id,
 * source, and target are remapped.
 */
export function duplicateEdges(
  edges: Edge[],
  idMap: Map<string, string>,
  generateEdgeId: () => string
): Edge[] {
  const result: Edge[] = [];
  for (const e of edges) {
    const newSource = idMap.get(e.source);
    const newTarget = idMap.get(e.target);
    if (!newSource || !newTarget) continue;
    result.push({
      ...e,
      id: generateEdgeId(),
      source: newSource,
      target: newTarget,
      selected: false,
    });
  }
  return result;
}

/**
 * Re-parent the direct children of a deleted node.
 *
 * This handles any node that has children (``parentId === deletedId``),
 * not just ``section``-shaped groups — a group whose shape was changed via
 * the inspector still has children that must be re-parented, and orphans
 * with a dangling ``parentId``/``extent: "parent"`` would break React Flow.
 *
 * - The deleted node's children are converted to absolute coordinates via
 *   ``resolveAbsolutePosition`` (so nested groups whose ``position`` is
 *   relative to an outer parent are handled correctly).
 * - If the deleted node itself had a ``parentId`` (it was nested), the
 *   children are re-parented to that outer group with coordinates relative
 *   to it. Otherwise they become free nodes at their absolute position.
 *
 * Returns a new node array with the deleted node removed and its children
 * re-based. Caller is responsible for also dropping edges that referenced
 * the deleted id.
 */
export function reparentChildrenOfDeletedGroup(allNodes: Node[], deletedId: string): Node[] {
  const deleted = allNodes.find((n) => n.id === deletedId);
  if (!deleted) return allNodes;
  const hasChildren = allNodes.some((n) => n.parentId === deletedId);
  if (!hasChildren) return allNodes.filter((n) => n.id !== deletedId);

  const outerParentId = deleted.parentId;
  const outerParent = outerParentId ? allNodes.find((n) => n.id === outerParentId) : undefined;
  const outerAbs = outerParent ? resolveAbsolutePosition(outerParent, allNodes) : null;

  return allNodes
    .filter((n) => n.id !== deletedId)
    .map((n) => {
      if (n.parentId !== deletedId) return n;
      const abs = resolveAbsolutePosition(n, allNodes);
      if (outerParentId && outerAbs) {
        return {
          ...n,
          position: { x: abs.x - outerAbs.x, y: abs.y - outerAbs.y },
          parentId: outerParentId,
          extent: "parent" as const,
        };
      }
      return {
        ...n,
        position: { x: abs.x, y: abs.y },
        parentId: undefined,
        extent: undefined,
      };
    });
}

/**
 * Resolve a node's effective width, checking both the top-level ``width``
 * property and ``style.width`` (container nodes use ``style`` per React
 * Flow's parent-node pattern). Falls back to ``DEFAULT_WIDTH``.
 */
export function nodeWidth(node: Node): number {
  if (typeof node.width === "number") return node.width;
  const styleW = (node.style as { width?: unknown } | undefined)?.width;
  return typeof styleW === "number" ? styleW : DEFAULT_WIDTH;
}

/**
 * Resolve a node's effective height, checking both the top-level ``height``
 * property and ``style.height`` (container nodes use ``style`` per React
 * Flow's parent-node pattern). Falls back to ``DEFAULT_HEIGHT``.
 */
export function nodeHeight(node: Node): number {
  if (typeof node.height === "number") return node.height;
  const styleH = (node.style as { height?: unknown } | undefined)?.height;
  return typeof styleH === "number" ? styleH : DEFAULT_HEIGHT;
}

/**
 * Ungroup a container node: remove it and re-parent its direct children.
 *
 * Unlike ``reparentChildrenOfDeletedGroup`` (which is for deletion and
 * handles any node), this is specifically for the Ungroup action — the
 * container is removed and its children are released to the container's
 * parent (if nested) or to the canvas (if top-level), using absolute
 * coordinate resolution so nested containers are handled correctly.
 *
 * Returns a new node array with the container removed and its children
 * re-based. Caller is responsible for also dropping edges that referenced
 * the container id (if any).
 */
export function removeEdgesForNodeIds(edges: Edge[], nodeIds: ReadonlySet<string>): Edge[] {
  return edges.filter((edge) => !nodeIds.has(edge.source) && !nodeIds.has(edge.target));
}

export function ungroupChildren(allNodes: Node[], groupId: string): Node[] {
  const group = allNodes.find((n) => n.id === groupId);
  if (!group) return allNodes;
  const hasChildren = allNodes.some((n) => n.parentId === groupId);
  if (!hasChildren) return allNodes.filter((n) => n.id !== groupId);

  const outerParentId = group.parentId;
  const outerParent = outerParentId ? allNodes.find((n) => n.id === outerParentId) : undefined;
  const outerAbs = outerParent ? resolveAbsolutePosition(outerParent, allNodes) : null;

  return allNodes
    .filter((n) => n.id !== groupId)
    .map((n) => {
      if (n.parentId !== groupId) return n;
      const abs = resolveAbsolutePosition(n, allNodes);
      if (outerParentId && outerAbs) {
        return {
          ...n,
          position: { x: abs.x - outerAbs.x, y: abs.y - outerAbs.y },
          parentId: outerParentId,
          extent: "parent" as const,
        };
      }
      return {
        ...n,
        position: { x: abs.x, y: abs.y },
        parentId: undefined,
        extent: undefined,
      };
    });
}
