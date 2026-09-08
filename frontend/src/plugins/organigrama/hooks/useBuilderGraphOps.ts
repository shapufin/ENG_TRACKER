/** Graph mutation operations for the Organigrama builder canvas.
 *
 * Extracted from OrganigramaBuilderPage so the stateful group/ungroup/
 * duplicate/delete/shape-conversion handlers are unit-testable
 * independently of the full React Flow wiring. Pure coordinate math stays
 * in groupHelpers.ts; this hook owns the state transitions that combine
 * those helpers with React Flow node/edge state.
 *
 * React Flow invariants preserved:
 *   - parents before children in the nodes array (orderNodesParentFirst);
 *   - no manual parent drag delta handler;
 *   - container dimensions in style:{width,height};
 *   - group header drag handle;
 *   - hierarchy only through reports_to/contains edges;
 *   - visual membership only through group_uuid (parentId in React Flow).
 */
import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import {
  computeGroupBounds,
  rebaseNodeToGroup,
  duplicateNodes,
  duplicateEdges,
  reparentChildrenOfDeletedGroup,
  ungroupChildren,
  removeEdgesForNodeIds,
  isContainerNode,
  nodeWidth,
  nodeHeight,
  nodeLayoutProps,
  orderNodesParentFirst,
} from "../pages/groupHelpers";
import { builderEdgeProps } from "../components/builderEdgeHelpers";
import type { BuilderNodeData, EdgeType, ShapeType } from "../types";

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 80;

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function makeNode(shape: ShapeType, count: number): Node {
  const x = 100 + (count % 5) * 40;
  const y = 100 + Math.floor(count / 5) * 80;
  const data: BuilderNodeData = {
    shape_type: shape,
    display_name: `New ${shape}`,
    status: shape === "position" ? "vacant" : "active",
    sort_order: 0,
    is_searchable: true,
    is_visible: true,
    style_key: "",
    custom_fields: {},
  };
  return {
    id: newId(),
    type: "builderNode",
    position: { x, y },
    ...nodeLayoutProps(shape, DEFAULT_WIDTH, DEFAULT_HEIGHT),
    data,
  } as Node;
}

export interface BuilderGraphOps {
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  addShape: (shape: ShapeType) => void;
  onConnect: (connection: Connection) => void;
  handleGroup: () => void;
  ungroupNode: (groupId: string) => void;
  handleUngroup: () => void;
  duplicateNodesAndEdges: (nodeIds: string[]) => void;
  handleDuplicate: () => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteSelected: () => void;
  updateSelectedNode: <K extends keyof BuilderNodeData>(key: K, value: BuilderNodeData[K]) => void;
  updateSelectedEdgeType: (edgeType: EdgeType) => void;
}

interface UseBuilderGraphOpsArgs {
  nodes: Node[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  selectedNode: Node | undefined;
  selectedNodeIds: string[];
  selectedEdge: Edge | undefined;
  setLastSelectedId: Dispatch<SetStateAction<string | null>>;
  setContextMenu: Dispatch<SetStateAction<{ x: number; y: number; nodeId: string } | null>>;
}

export function useBuilderGraphOps({
  nodes,
  edges,
  setNodes,
  setEdges,
  selectedNode,
  selectedNodeIds,
  selectedEdge,
  setLastSelectedId,
  setContextMenu,
}: UseBuilderGraphOpsArgs): BuilderGraphOps {
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Collect removed ids to clean up dangling edges. Without this, keyboard
      // Delete/Backspace (which goes through onNodesChange, not handleDeleteNode)
      // leaves edges with dangling source/target in state — they're silently
      // dropped on save by draft_service, causing data loss.
      const removedIds = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
      if (removedIds.size > 0) {
        setEdges((eds) =>
          eds.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target))
        );
      }
      setNodes((nds) => {
        let next = nds;
        for (const c of changes) {
          if (c.type === "remove") {
            // Re-parent children of any deleted node that has children, using
            // absolute-coordinate resolution so nested groups are handled.
            // This covers any container shape (not just "section") and nodes
            // whose shape was changed via the inspector after grouping.
            next = reparentChildrenOfDeletedGroup(next, c.id);
          }
        }
        // Let ALL changes through — including "select" — so React Flow's
        // built-in box/marquee selection works. The previous filter
        // (c.type !== "select") broke box select entirely.
        return applyNodeChanges(changes, next);
      });
    },
    [setEdges, setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const addShape = useCallback(
    (shape: ShapeType) => {
      setNodes((prev) => [...prev, makeNode(shape, prev.length)]);
    },
    [setNodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge: Edge = {
        id: newId(),
        source: connection.source,
        target: connection.target,
        ...builderEdgeProps("reports_to"),
        data: { edge_type: "reports_to" } as Record<string, unknown>,
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const handleGroup = useCallback(() => {
    if (selectedNodeIds.length < 2) return;
    setNodes((prev) => {
      const selected = prev.filter((n) => selectedNodeIds.includes(n.id));
      if (selected.length < 2) return prev;
      // Resolve absolute positions so nested nodes are correctly bounded.
      const { minX, minY, maxX, maxY } = computeGroupBounds(selected, prev);
      const padding = 40;
      const header = 40;
      const groupX = minX - padding / 2;
      const groupY = minY - header - padding / 2;
      const groupW = maxX - minX + padding;
      const groupH = maxY - minY + header + padding;
      const groupId = newId();
      const groupNode: Node = {
        id: groupId,
        type: "builderNode",
        position: { x: groupX, y: groupY },
        // Container nodes use style:{width,height} per React Flow's
        // recommended parent-node pattern. Top-level width/height + zIndex:-1
        // can break automatic child-follow-on-drag.
        style: { width: groupW, height: groupH },
        zIndex: 0,
        dragHandle: ".builder-group-drag-handle",
        selected: true,
        data: {
          shape_type: "section",
          display_name: "Group",
          status: "active",
        } as BuilderNodeData,
      };
      const updated = prev.map((n) =>
        selectedNodeIds.includes(n.id)
          ? {
              ...rebaseNodeToGroup(n, prev, groupId, { x: groupX, y: groupY }),
              selected: false,
            }
          : { ...n, selected: false }
      );
      return orderNodesParentFirst([...updated, groupNode]);
    });
    setLastSelectedId(null);
  }, [selectedNodeIds, setNodes, setLastSelectedId]);

  const ungroupNode = useCallback(
    (groupId: string) => {
      setNodes((prev) => ungroupChildren(prev, groupId));
      setEdges((prev) => removeEdgesForNodeIds(prev, new Set([groupId])));
      setLastSelectedId(null);
    },
    [setEdges, setNodes, setLastSelectedId]
  );

  const handleUngroup = useCallback(() => {
    if (!selectedNode) return;
    ungroupNode(selectedNode.id);
  }, [selectedNode, ungroupNode]);

  // Shared duplicate logic for both the toolbar button and the context menu.
  // Computes duplicates OUTSIDE the setNodes updater so setEdges is not called
  // inside a state updater (which double-fires in React StrictMode, causing
  // edges to be duplicated twice).
  const duplicateNodesAndEdges = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length === 0) return;
      const selected = nodes.filter((n) => nodeIds.includes(n.id));
      if (selected.length === 0) return;
      const dups = duplicateNodes(selected, newId, nodes);
      const idMap = new Map(selected.map((n, i) => [n.id, dups[i].id]));
      const newEdges = duplicateEdges(edges, idMap, newId);
      setNodes((prev) => [...prev, ...dups]);
      setEdges((prev) => [...prev, ...newEdges]);
    },
    [nodes, edges, setNodes, setEdges]
  );

  const handleDuplicate = useCallback(() => {
    duplicateNodesAndEdges(selectedNodeIds);
  }, [duplicateNodesAndEdges, selectedNodeIds]);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      // onNodesChange handles both child re-parenting and edge cleanup.
      onNodesChange([{ id: nodeId, type: "remove" } as NodeChange]);
      setContextMenu(null);
    },
    [onNodesChange, setContextMenu]
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const ids = new Set(selectedNodeIds);
    setNodes((prev) => {
      // Re-parent children of each deleted node before removing it, so
      // children of a deleted group don't keep a dangling parentId/extent.
      // Process in order so nested-group children land on the right outer
      // parent (the outer group is re-parented first if it's also selected).
      let next = prev;
      for (const id of selectedNodeIds) {
        next = reparentChildrenOfDeletedGroup(next, id);
      }
      return next.filter((n) => !ids.has(n.id));
    });
    setEdges((prev) => prev.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setLastSelectedId(null);
  }, [selectedNodeIds, setNodes, setEdges, setLastSelectedId]);

  const updateSelectedNode = useCallback(
    <K extends keyof BuilderNodeData>(key: K, value: BuilderNodeData[K]) => {
      if (!selectedNode) return;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== selectedNode.id) return n;
          const nextData = { ...n.data, [key]: value } as Record<string, unknown>;
          let next = { ...n, data: nextData };
          // When shape_type changes, migrate dimensions between the
          // container pattern (style:{width,height}) and the non-container
          // pattern (top-level width/height). Without this, a container→
          // non-container change leaves style:{width,height} but BuilderNode
          // uses width??DEFAULT (ignoring style), and non-container→container
          // leaves top-level width/height but BuilderNode uses 100% (ignoring
          // them). Both cases lose the node's actual dimensions.
          if (key === "shape_type") {
            const wasContainer = isContainerNode(n);
            const willBeContainer = isContainerNode({ data: nextData } as unknown as Node);
            if (wasContainer && !willBeContainer) {
              // Container → non-container: move style dims to top-level
              const w = nodeWidth(n);
              const h = nodeHeight(n);
              next = {
                ...next,
                style: undefined,
                width: w,
                height: h,
                zIndex: undefined,
                dragHandle: undefined,
              };
            } else if (!wasContainer && willBeContainer) {
              // Non-container → container: move top-level dims to style
              const w = nodeWidth(n);
              const h = nodeHeight(n);
              next = {
                ...next,
                style: { width: w, height: h },
                width: undefined,
                height: undefined,
                zIndex: 0,
                dragHandle: ".builder-group-drag-handle",
              };
            }
          }
          return next;
        })
      );
    },
    [selectedNode, setNodes]
  );

  const updateSelectedEdgeType = useCallback(
    (edgeType: EdgeType) => {
      if (!selectedEdge) return;
      setEdges((prev) =>
        prev.map((e) =>
          e.id === selectedEdge.id
            ? {
                ...e,
                ...builderEdgeProps(edgeType),
                data: { edge_type: edgeType } as Record<string, unknown>,
              }
            : e
        )
      );
    },
    [selectedEdge, setEdges]
  );

  return {
    onNodesChange,
    onEdgesChange,
    addShape,
    onConnect,
    handleGroup,
    ungroupNode,
    handleUngroup,
    duplicateNodesAndEdges,
    handleDuplicate,
    handleDeleteNode,
    handleDeleteSelected,
    updateSelectedNode,
    updateSelectedEdgeType,
  };
}
