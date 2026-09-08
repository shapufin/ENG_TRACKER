/** Focused tests for the extracted builder graph-ops hook.
 *
 * These verify the stateful transitions (group/ungroup/duplicate/delete/
 * shape conversion) in isolation, without rendering the full React Flow
 * canvas. The pure coordinate helpers are already covered by
 * groupHelpers.test.ts; here we test the hook that wires those helpers
 * to React Flow node/edge state.
 */
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import { useBuilderGraphOps } from "../hooks/useBuilderGraphOps";
import { useBuilderSelection } from "../hooks/useBuilderSelection";
import type { BuilderNodeData } from "../types";

function makePersonNode(id: string, x = 0, y = 0, selected = false): Node {
  return {
    id,
    type: "builderNode",
    position: { x, y },
    width: 180,
    height: 80,
    selected,
    data: {
      shape_type: "person",
      display_name: id,
      status: "active",
      sort_order: 0,
      is_searchable: true,
      is_visible: true,
      style_key: "",
      custom_fields: {},
    } as BuilderNodeData,
  } as Node;
}

function makeContainerNode(id: string, x: number, y: number, w: number, h: number): Node {
  return {
    id,
    type: "builderNode",
    position: { x, y },
    style: { width: w, height: h },
    zIndex: 0,
    dragHandle: ".builder-group-drag-handle",
    data: {
      shape_type: "section",
      display_name: id,
      status: "active",
      sort_order: 0,
      is_searchable: true,
      is_visible: true,
      style_key: "",
      custom_fields: {},
    } as BuilderNodeData,
  } as Node;
}

function makeEdge(id: string, source: string, target: string, selected = false): Edge {
  return {
    id,
    source,
    target,
    type: "default",
    selected,
    data: { edge_type: "reports_to" },
  } as Edge;
}

/** Test harness that wires nodes/edges state to both hooks, mirroring the
 * builder page's composition. */
function renderBuilder(initialNodes: Node[], initialEdges: Edge[] = []) {
  const { result } = renderHook(() => {
    const [nodes, setNodes] = useState<Node[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);
    const sel = useBuilderSelection(nodes, edges, setNodes);
    const ops = useBuilderGraphOps({
      nodes,
      edges,
      setNodes,
      setEdges,
      selectedNode: sel.selectedNode,
      selectedNodeIds: sel.selectedNodeIds,
      selectedEdge: sel.selectedEdge,
      setLastSelectedId: sel.setLastSelectedId,
      setContextMenu: sel.setContextMenu,
    });
    return { nodes, edges, sel, ops };
  });
  return result;
}

describe("useBuilderGraphOps.addShape", () => {
  it("adds a new node with the given shape", () => {
    const result = renderBuilder([]);
    act(() => result.current.ops.addShape("person"));
    expect(result.current.nodes).toHaveLength(1);
    expect((result.current.nodes[0].data as BuilderNodeData).shape_type).toBe("person");
  });

  it("creates a vacant status for position shapes", () => {
    const result = renderBuilder([]);
    act(() => result.current.ops.addShape("position"));
    expect((result.current.nodes[0].data as BuilderNodeData).status).toBe("vacant");
  });
});

describe("useBuilderGraphOps.onConnect", () => {
  it("adds a reports_to edge between source and target", () => {
    const result = renderBuilder([makePersonNode("a"), makePersonNode("b")]);
    act(() => result.current.ops.onConnect({ source: "a", target: "b" } as never));
    expect(result.current.edges).toHaveLength(1);
    expect(result.current.edges[0].source).toBe("a");
    expect(result.current.edges[0].target).toBe("b");
    expect((result.current.edges[0].data as { edge_type: string }).edge_type).toBe("reports_to");
  });

  it("ignores connections missing source or target", () => {
    const result = renderBuilder([makePersonNode("a")]);
    act(() => result.current.ops.onConnect({ source: null, target: "a" } as never));
    expect(result.current.edges).toHaveLength(0);
  });
});

describe("useBuilderGraphOps.handleGroup", () => {
  it("creates a section container with children rebased to parent-relative coords", () => {
    const n1 = makePersonNode("n1", 100, 100, true);
    const n2 = makePersonNode("n2", 200, 100, true);
    const result = renderBuilder([n1, n2]);
    act(() => result.current.ops.handleGroup());
    const nodes = result.current.nodes;
    // 2 originals + 1 group = 3
    expect(nodes).toHaveLength(3);
    const group = nodes.find((n) => (n.data as BuilderNodeData).shape_type === "section");
    expect(group).toBeDefined();
    expect(group!.parentId).toBeUndefined();
    // Children should have parentId set to the group
    const child1 = nodes.find((n) => n.id === "n1");
    expect(child1!.parentId).toBe(group!.id);
    expect(child1!.extent).toBe("parent");
  });

  it("does nothing when fewer than 2 nodes are selected", () => {
    const n1 = makePersonNode("n1", 100, 100, true);
    const result = renderBuilder([n1]);
    act(() => result.current.ops.handleGroup());
    expect(result.current.nodes).toHaveLength(1);
  });
});

describe("useBuilderGraphOps.ungroupNode", () => {
  it("removes the group and releases children to absolute coords", () => {
    const group = makeContainerNode("grp", 50, 50, 300, 200);
    const child = { ...makePersonNode("c1", 10, 10), parentId: "grp", extent: "parent" as const };
    const result = renderBuilder([group, child]);
    act(() => result.current.ops.ungroupNode("grp"));
    const nodes = result.current.nodes;
    expect(nodes.find((n) => n.id === "grp")).toBeUndefined();
    const released = nodes.find((n) => n.id === "c1");
    expect(released!.parentId).toBeUndefined();
  });

  it("removes edges connected to the group node", () => {
    const group = makeContainerNode("grp", 50, 50, 300, 200);
    const child = { ...makePersonNode("c1", 10, 10), parentId: "grp", extent: "parent" as const };
    const edge = makeEdge("e1", "grp", "c1");
    const result = renderBuilder([group, child], [edge]);
    act(() => result.current.ops.ungroupNode("grp"));
    expect(result.current.edges).toHaveLength(0);
  });
});

describe("useBuilderGraphOps.handleDeleteSelected", () => {
  it("removes selected nodes and their connected edges", () => {
    const n1 = makePersonNode("n1", 0, 0, true);
    const n2 = makePersonNode("n2", 100, 0, false);
    const edge = makeEdge("e1", "n1", "n2");
    const result = renderBuilder([n1, n2], [edge]);
    act(() => result.current.ops.handleDeleteSelected());
    expect(result.current.nodes.find((n) => n.id === "n1")).toBeUndefined();
    expect(result.current.nodes.find((n) => n.id === "n2")).toBeDefined();
    // Edge from deleted n1 to n2 should be cleaned up
    expect(result.current.edges).toHaveLength(0);
  });

  it("re-parents children of a deleted group before removing it", () => {
    const group = makeContainerNode("grp", 50, 50, 300, 200);
    const child = { ...makePersonNode("c1", 10, 10), parentId: "grp", extent: "parent" as const };
    // Mark group as selected for deletion
    group.selected = true;
    const result = renderBuilder([group, child]);
    act(() => result.current.ops.handleDeleteSelected());
    const nodes = result.current.nodes;
    expect(nodes.find((n) => n.id === "grp")).toBeUndefined();
    const released = nodes.find((n) => n.id === "c1");
    expect(released!.parentId).toBeUndefined();
  });
});

describe("useBuilderGraphOps.handleDeleteNode", () => {
  it("removes a single node by id and cleans up edges", () => {
    const n1 = makePersonNode("n1");
    const n2 = makePersonNode("n2", 100, 0);
    const edge = makeEdge("e1", "n1", "n2");
    const result = renderBuilder([n1, n2], [edge]);
    act(() => result.current.ops.handleDeleteNode("n1"));
    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.edges).toHaveLength(0);
  });
});

describe("useBuilderGraphOps.duplicateNodesAndEdges", () => {
  it("duplicates selected nodes and internal edges with new ids", () => {
    const n1 = makePersonNode("n1", 0, 0);
    const n2 = makePersonNode("n2", 100, 0);
    const edge = makeEdge("e1", "n1", "n2");
    const result = renderBuilder([n1, n2], [edge]);
    act(() => result.current.ops.duplicateNodesAndEdges(["n1", "n2"]));
    // 2 originals + 2 duplicates = 4
    expect(result.current.nodes).toHaveLength(4);
    // 1 original edge + 1 duplicated internal edge = 2
    expect(result.current.edges).toHaveLength(2);
  });

  it("does nothing for empty id list", () => {
    const result = renderBuilder([makePersonNode("n1")]);
    act(() => result.current.ops.duplicateNodesAndEdges([]));
    expect(result.current.nodes).toHaveLength(1);
  });
});

describe("useBuilderGraphOps.updateSelectedNode", () => {
  it("updates the display_name of the selected node", () => {
    const n1 = makePersonNode("n1", 0, 0, true);
    const result = renderBuilder([n1]);
    act(() => result.current.ops.updateSelectedNode("display_name", "Renamed"));
    expect((result.current.nodes[0].data as BuilderNodeData).display_name).toBe("Renamed");
  });

  it("migrates dimensions from style to top-level when shape changes container→person", () => {
    const group = { ...makeContainerNode("grp", 50, 50, 300, 200), selected: true };
    const result = renderBuilder([group]);
    act(() => result.current.ops.updateSelectedNode("shape_type", "person"));
    const node = result.current.nodes[0];
    // Container→non-container: style should be cleared, width/height moved to top-level
    expect(node.style).toBeUndefined();
    expect(node.width).toBe(300);
    expect(node.height).toBe(200);
    expect(node.zIndex).toBeUndefined();
  });

  it("migrates dimensions from top-level to style when shape changes person→section", () => {
    const person = { ...makePersonNode("p1", 0, 0, true), width: 200, height: 100 };
    const result = renderBuilder([person]);
    act(() => result.current.ops.updateSelectedNode("shape_type", "section"));
    const node = result.current.nodes[0];
    // Non-container→container: width/height moved to style, zIndex=0
    expect(node.style).toEqual({ width: 200, height: 100 });
    expect(node.width).toBeUndefined();
    expect(node.height).toBeUndefined();
    expect(node.zIndex).toBe(0);
    expect(node.dragHandle).toBe(".builder-group-drag-handle");
  });

  it("does nothing when no node is selected", () => {
    const n1 = makePersonNode("n1", 0, 0, false);
    const result = renderBuilder([n1]);
    act(() => result.current.ops.updateSelectedNode("display_name", "Nope"));
    expect((result.current.nodes[0].data as BuilderNodeData).display_name).toBe("n1");
  });
});

describe("useBuilderGraphOps.updateSelectedEdgeType", () => {
  it("updates the selected edge type and data", () => {
    const edge = { ...makeEdge("e1", "a", "b"), selected: true };
    const result = renderBuilder([makePersonNode("a"), makePersonNode("b")], [edge]);
    act(() => result.current.ops.updateSelectedEdgeType("dotted_line"));
    const updated = result.current.edges[0];
    expect((updated.data as { edge_type: string }).edge_type).toBe("dotted_line");
  });

  it("does nothing when no edge is selected", () => {
    const edge = makeEdge("e1", "a", "b", false);
    const result = renderBuilder([makePersonNode("a"), makePersonNode("b")], [edge]);
    act(() => result.current.ops.updateSelectedEdgeType("dotted_line"));
    expect((result.current.edges[0].data as { edge_type: string }).edge_type).toBe("reports_to");
  });
});

describe("useBuilderSelection", () => {
  it("derives selectedNode and selectedNodeIds from node.selected flags", () => {
    const n1 = makePersonNode("n1", 0, 0, true);
    const n2 = makePersonNode("n2", 100, 0, false);
    const result = renderBuilder([n1, n2]);
    expect(result.current.sel.selectedNode?.id).toBe("n1");
    expect(result.current.sel.selectedNodeIds).toEqual(["n1"]);
  });

  it("onPaneClick clears all selection flags", () => {
    const n1 = makePersonNode("n1", 0, 0, true);
    const result = renderBuilder([n1]);
    act(() => result.current.sel.onPaneClick());
    expect(result.current.sel.selectedNodeIds).toEqual([]);
    expect(result.current.sel.lastSelectedId).toBeNull();
  });

  it("onNodeContextMenu sets the context menu target", () => {
    const n1 = makePersonNode("n1", 0, 0);
    const result = renderBuilder([n1]);
    act(() =>
      result.current.sel.onNodeContextMenu(
        { preventDefault: () => {}, clientX: 100, clientY: 200 } as never,
        n1
      )
    );
    expect(result.current.sel.contextMenu).toEqual({ x: 100, y: 200, nodeId: "n1" });
  });
});
