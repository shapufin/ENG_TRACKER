/** Selection and context-menu state for the Organigrama builder canvas.
 *
 * Extracted from OrganigramaBuilderPage so selection logic is unit-testable
 * independently of the full React Flow wiring. The hook owns:
 *   - the last-selected node id (for shift-click range selection);
 *   - the context-menu target;
 *   - single-click / shift-click / pane-click / context-menu handlers;
 *   - derived selected node/edge/ids from the current nodes/edges.
 *
 * Graph mutations (group/ungroup/duplicate/delete) live in
 * useBuilderGraphOps and receive this hook's derived values and setters.
 */
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

export interface BuilderSelection {
  selectedNode: Node | undefined;
  selectedNodeIds: string[];
  selectedEdge: Edge | undefined;
  lastSelectedId: string | null;
  setLastSelectedId: Dispatch<SetStateAction<string | null>>;
  contextMenu: { x: number; y: number; nodeId: string } | null;
  setContextMenu: Dispatch<SetStateAction<{ x: number; y: number; nodeId: string } | null>>;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onPaneClick: () => void;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onPaneContextMenu: (event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => void;
}

export function useBuilderSelection(
  nodes: Node[],
  edges: Edge[],
  setNodes: Dispatch<SetStateAction<Node[]>>
): BuilderSelection {
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);

  const selectedNode = useMemo(() => nodes.find((n) => n.selected), [nodes]);
  const selectedNodeIds = useMemo(() => nodes.filter((n) => n.selected).map((n) => n.id), [nodes]);
  const selectedEdge = useMemo(() => edges.find((e) => e.selected), [edges]);

  // Single-click and ctrl-click selection are handled natively by React Flow
  // via "select" changes (let through in onNodesChange). We only intercept
  // shift-click for range selection, which React Flow doesn't support
  // natively.
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.shiftKey && lastSelectedId) {
        setNodes((prev) => {
          const all = prev.map((n) => n.id);
          const start = all.indexOf(lastSelectedId);
          const end = all.indexOf(node.id);
          if (start === -1 || end === -1) return prev;
          const [lo, hi] = start < end ? [start, end] : [end, start];
          const range = new Set(all.slice(lo, hi + 1));
          return prev.map((n) => ({ ...n, selected: range.has(n.id) }));
        });
      }
      setLastSelectedId(node.id);
      setContextMenu(null);
    },
    [lastSelectedId, setNodes]
  );

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const onPaneClick = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
    setLastSelectedId(null);
    setContextMenu(null);
  }, [setNodes]);

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
      event.preventDefault();
      setContextMenu(null);
    },
    []
  );

  return {
    selectedNode,
    selectedNodeIds,
    selectedEdge,
    lastSelectedId,
    setLastSelectedId,
    contextMenu,
    setContextMenu,
    onNodeClick,
    onPaneClick,
    onNodeContextMenu,
    onPaneContextMenu,
  };
}
