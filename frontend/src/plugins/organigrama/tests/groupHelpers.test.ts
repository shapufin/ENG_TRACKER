/** Tests for the pure group/ungroup coordinate helpers. */
import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import {
  resolveAbsolutePosition,
  computeGroupBounds,
  rebaseNodeToGroup,
  duplicateNodes,
  duplicateEdges,
  reparentChildrenOfDeletedGroup,
  ungroupChildren,
  removeEdgesForNodeIds,
  nodeWidth,
  nodeHeight,
  orderNodesParentFirst,
  nodeLayoutProps,
} from "../pages/groupHelpers";
import type { BuilderNodeData } from "../types";

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 80;

function makeNode(id: string, x: number, y: number, parentId?: string): Node {
  return {
    id,
    type: "builderNode",
    position: { x, y },
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    parentId,
    data: { shape_type: "person", display_name: id, status: "active" } as BuilderNodeData,
  } as Node;
}

describe("resolveAbsolutePosition", () => {
  it("returns the node position when there is no parent", () => {
    const node = makeNode("a", 100, 200);
    expect(resolveAbsolutePosition(node, [node])).toEqual({ x: 100, y: 200 });
  });

  it("walks up a single-level parentId chain", () => {
    const group = makeNode("g", 300, 400);
    const child = makeNode("c", 50, 60, "g");
    expect(resolveAbsolutePosition(child, [group, child])).toEqual({ x: 350, y: 460 });
  });

  it("walks up a multi-level parentId chain", () => {
    const outer = makeNode("o", 1000, 2000);
    const inner = makeNode("i", 100, 200, "o");
    const leaf = makeNode("l", 10, 20, "i");
    expect(resolveAbsolutePosition(leaf, [outer, inner, leaf])).toEqual({ x: 1110, y: 2220 });
  });

  it("returns the node position when parent is missing", () => {
    const orphan = makeNode("orphan", 50, 60, "ghost");
    expect(resolveAbsolutePosition(orphan, [orphan])).toEqual({ x: 50, y: 60 });
  });
});

describe("nodeLayoutProps", () => {
  it("uses the React Flow parent pattern for container shapes", () => {
    expect(nodeLayoutProps("department", 320, 240)).toEqual({
      style: { width: 320, height: 240 },
      zIndex: 0,
      dragHandle: ".builder-group-drag-handle",
    });
  });

  it("uses top-level dimensions for leaf shapes", () => {
    expect(nodeLayoutProps("person", 180, 80)).toEqual({
      width: 180,
      height: 80,
    });
  });
});

describe("orderNodesParentFirst", () => {
  it("places parents before direct and nested children while preserving sibling order", () => {
    const outer = makeNode("outer", 0, 0);
    const child = makeNode("child", 10, 10, "outer");
    const inner = makeNode("inner", 20, 20, "outer");
    const leaf = makeNode("leaf", 5, 5, "inner");
    const unrelated = makeNode("unrelated", 100, 100);

    const result = orderNodesParentFirst([child, leaf, unrelated, inner, outer]);

    expect(result.map((node) => node.id)).toEqual(["unrelated", "outer", "child", "inner", "leaf"]);
  });

  it("keeps a dangling child usable without inventing a missing parent", () => {
    const orphan = makeNode("orphan", 10, 10, "missing");
    const other = makeNode("other", 20, 20);

    expect(orderNodesParentFirst([orphan, other]).map((node) => node.id)).toEqual([
      "orphan",
      "other",
    ]);
  });
});

describe("computeGroupBounds", () => {
  it("computes the bounding box from absolute positions", () => {
    const nodes = [makeNode("a", 100, 200), makeNode("b", 300, 400)];
    const bounds = computeGroupBounds(nodes);
    expect(bounds.minX).toBe(100);
    expect(bounds.minY).toBe(200);
    expect(bounds.maxX).toBe(300 + DEFAULT_WIDTH);
    expect(bounds.maxY).toBe(400 + DEFAULT_HEIGHT);
  });

  it("resolves nested-node positions to absolute before computing bounds", () => {
    const group = makeNode("g", 500, 600);
    const child = makeNode("c", 50, 60, "g");
    const freeNode = makeNode("f", 100, 200);
    const bounds = computeGroupBounds([child, freeNode], [group, child, freeNode]);
    // child absolute = (550, 660), freeNode = (100, 200)
    expect(bounds.minX).toBe(100);
    expect(bounds.minY).toBe(200);
    expect(bounds.maxX).toBe(550 + DEFAULT_WIDTH);
    expect(bounds.maxY).toBe(660 + DEFAULT_HEIGHT);
  });
});

describe("rebaseNodeToGroup", () => {
  it("converts an absolute node to group-relative coordinates", () => {
    const node = makeNode("a", 100, 200);
    const result = rebaseNodeToGroup(node, [node], "g", { x: 80, y: 160 });
    expect(result.position).toEqual({ x: 20, y: 40 });
    expect(result.parentId).toBe("g");
    expect(result.extent).toBe("parent");
  });

  it("converts a nested node to the new group's relative coordinates", () => {
    const oldGroup = makeNode("og", 500, 600);
    const child = makeNode("c", 50, 60, "og");
    // child absolute = (550, 660)
    const newGroupPos = { x: 530, y: 640 };
    const result = rebaseNodeToGroup(child, [oldGroup, child], "ng", newGroupPos);
    // new relative = (550 - 530, 660 - 640) = (20, 20)
    expect(result.position).toEqual({ x: 20, y: 20 });
    expect(result.parentId).toBe("ng");
  });
});

describe("duplicateNodes", () => {
  it("duplicates a single node with offset coordinates and a new id", () => {
    const node = makeNode("a", 100, 200);
    const result = duplicateNodes([node], () => "new-id");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("new-id");
    expect(result[0].position).toEqual({ x: 140, y: 240 }); // +40 offset
    expect(result[0].parentId).toBeUndefined(); // duplicates are unparented
    expect(result[0].data).toEqual(node.data); // data preserved
  });

  it("duplicates multiple nodes each with unique ids", () => {
    const nodes = [makeNode("a", 100, 200), makeNode("b", 300, 400)];
    let counter = 0;
    const result = duplicateNodes(nodes, () => `dup-${++counter}`);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("dup-1");
    expect(result[1].id).toBe("dup-2");
  });

  it("unparents duplicated nodes that were inside a group", () => {
    const group = makeNode("g", 500, 600);
    const child = makeNode("c", 50, 60, "g");
    const result = duplicateNodes([child], () => "dup-c", [group, child]);
    // child absolute = (550, 660), duplicate at (590, 700) with +40 offset
    expect(result[0].position).toEqual({ x: 590, y: 700 });
    expect(result[0].parentId).toBeUndefined();
  });
});

describe("reparentChildrenOfDeletedGroup", () => {
  it("re-parents top-level group children to absolute coordinates", () => {
    const group = makeNode("g", 300, 400);
    const child = makeNode("c", 50, 60, "g");
    // child absolute = (350, 460)
    const result = reparentChildrenOfDeletedGroup([group, child], "g");
    const reparented = result.find((n) => n.id === "c")!;
    expect(reparented.parentId).toBeUndefined();
    expect(reparented.extent).toBeUndefined();
    expect(reparented.position).toEqual({ x: 350, y: 460 });
  });

  it("re-parents nested-group children to the outer group with relative coords", () => {
    const outer = makeNode("o", 1000, 2000);
    const inner = makeNode("i", 100, 200, "o");
    const child = makeNode("c", 50, 60, "i");
    // child absolute = (1150, 2260); relative to outer = (150, 260)
    const result = reparentChildrenOfDeletedGroup([outer, inner, child], "i");
    const reparented = result.find((n) => n.id === "c")!;
    expect(reparented.parentId).toBe("o");
    expect(reparented.extent).toBe("parent");
    expect(reparented.position).toEqual({ x: 150, y: 260 });
  });

  it("removes the deleted node without altering others when it has no children", () => {
    const a = makeNode("a", 10, 20);
    const b = makeNode("b", 30, 40);
    const result = reparentChildrenOfDeletedGroup([a, b], "a");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
    expect(result[0].position).toEqual({ x: 30, y: 40 });
  });

  it("re-parents children of a department-shaped group (not just section)", () => {
    const group: Node = {
      ...makeNode("g", 300, 400),
      data: { shape_type: "department", display_name: "g", status: "active" } as BuilderNodeData,
    };
    const child = makeNode("c", 50, 60, "g");
    const result = reparentChildrenOfDeletedGroup([group, child], "g");
    const reparented = result.find((n) => n.id === "c")!;
    expect(reparented.parentId).toBeUndefined();
    expect(reparented.position).toEqual({ x: 350, y: 460 });
  });
});

describe("ungroupChildren", () => {
  it("re-parents top-level group children to absolute coordinates", () => {
    const group = makeNode("g", 300, 400);
    const child = makeNode("c", 50, 60, "g");
    // child absolute = (350, 460)
    const result = ungroupChildren([group, child], "g");
    const ungrouped = result.find((n) => n.id === "c")!;
    expect(ungrouped.parentId).toBeUndefined();
    expect(ungrouped.extent).toBeUndefined();
    expect(ungrouped.position).toEqual({ x: 350, y: 460 });
  });

  it("re-parents nested-group children to the outer group with relative coords", () => {
    const outer = makeNode("o", 1000, 2000);
    const inner = makeNode("i", 100, 200, "o");
    const child = makeNode("c", 50, 60, "i");
    // child absolute = (1150, 2260); relative to outer = (150, 260)
    const result = ungroupChildren([outer, inner, child], "i");
    const ungrouped = result.find((n) => n.id === "c")!;
    expect(ungrouped.parentId).toBe("o");
    expect(ungrouped.extent).toBe("parent");
    expect(ungrouped.position).toEqual({ x: 150, y: 260 });
  });

  it("removes the ungrouped node from the result", () => {
    const group = makeNode("g", 300, 400);
    const child = makeNode("c", 50, 60, "g");
    const result = ungroupChildren([group, child], "g");
    expect(result.find((n) => n.id === "g")).toBeUndefined();
    expect(result).toHaveLength(1);
  });

  it("is a no-op when the ungrouped id has no children", () => {
    const a = makeNode("a", 10, 20);
    const b = makeNode("b", 30, 40);
    const result = ungroupChildren([a, b], "a");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });
});

describe("removeEdgesForNodeIds", () => {
  it("removes edges connected to an ungrouped node", () => {
    const edges: Edge[] = [
      { id: "keep", source: "a", target: "b" },
      { id: "source", source: "g", target: "b" },
      { id: "target", source: "a", target: "g" },
    ];
    expect(removeEdgesForNodeIds(edges, new Set(["g"]))).toEqual([edges[0]]);
  });
});

describe("duplicateEdges", () => {
  function makeEdge(id: string, source: string, target: string): Edge {
    return {
      id,
      source,
      target,
      type: "step",
      data: { edge_type: "reports_to" } as Record<string, unknown>,
    };
  }

  it("duplicates edges between duplicated nodes with new IDs", () => {
    const originalNodes = [makeNode("a", 100, 200), makeNode("b", 300, 400)];
    const duplicatedNodes = duplicateNodes(originalNodes, (() => "dup") as () => string);
    // duplicateNodes uses a single generateId call per node — simulate real IDs
    let counter = 0;
    const dupsWithIds = duplicateNodes(originalNodes, () => `dup-${++counter}`);
    const idMap = new Map(originalNodes.map((n, i) => [n.id, dupsWithIds[i].id]));
    const edges = [makeEdge("e1", "a", "b")];
    const result = duplicateEdges(edges, idMap, () => "new-edge");
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe(idMap.get("a"));
    expect(result[0].target).toBe(idMap.get("b"));
    expect(result[0].id).toBe("new-edge");
  });

  it("skips edges where source or target was not duplicated", () => {
    const originalNodes = [makeNode("a", 100, 200)];
    let counter = 0;
    const dupsWithIds = duplicateNodes(originalNodes, () => `dup-${++counter}`);
    const idMap = new Map(originalNodes.map((n, i) => [n.id, dupsWithIds[i].id]));
    // Edge to a node that wasn't duplicated — should be skipped
    const edges = [makeEdge("e1", "a", "b")];
    const result = duplicateEdges(edges, idMap, () => "new-edge");
    expect(result).toHaveLength(0);
  });

  it("preserves edge type and data", () => {
    const originalNodes = [makeNode("a", 100, 200), makeNode("b", 300, 400)];
    let counter = 0;
    const dupsWithIds = duplicateNodes(originalNodes, () => `dup-${++counter}`);
    const idMap = new Map(originalNodes.map((n, i) => [n.id, dupsWithIds[i].id]));
    const edges: Edge[] = [
      {
        id: "e1",
        source: "a",
        target: "b",
        type: "simplebezier",
        data: { edge_type: "dotted_line" } as Record<string, unknown>,
        className: "stroke-amber-500",
        style: { strokeDasharray: "6 4" },
        label: "dotted",
      },
    ];
    const result = duplicateEdges(edges, idMap, () => "new-edge");
    expect(result[0].type).toBe("simplebezier");
    expect(result[0].data).toEqual({ edge_type: "dotted_line" });
    expect(result[0].className).toBe("stroke-amber-500");
    expect(result[0].label).toBe("dotted");
  });
});

describe("nodeWidth / nodeHeight", () => {
  it("returns the top-level width when set", () => {
    const node = makeNode("a", 10, 20);
    expect(nodeWidth(node)).toBe(DEFAULT_WIDTH);
    expect(nodeHeight(node)).toBe(DEFAULT_HEIGHT);
  });

  it("reads from style.width/style.height when top-level is undefined", () => {
    const node: Node = {
      ...makeNode("g", 10, 20),
      width: undefined,
      height: undefined,
      style: { width: 300, height: 200 },
    };
    expect(nodeWidth(node)).toBe(300);
    expect(nodeHeight(node)).toBe(200);
  });

  it("prefers top-level width over style.width", () => {
    const node: Node = {
      ...makeNode("g", 10, 20),
      width: 250,
      height: 150,
      style: { width: 300, height: 200 },
    };
    expect(nodeWidth(node)).toBe(250);
    expect(nodeHeight(node)).toBe(150);
  });

  it("falls back to DEFAULT when neither is set", () => {
    const node: Node = {
      ...makeNode("g", 10, 20),
      width: undefined,
      height: undefined,
      style: {},
    };
    expect(nodeWidth(node)).toBe(DEFAULT_WIDTH);
    expect(nodeHeight(node)).toBe(DEFAULT_HEIGHT);
  });

  it("falls back to DEFAULT when style is undefined", () => {
    const node: Node = {
      ...makeNode("g", 10, 20),
      width: undefined,
      height: undefined,
    };
    expect(nodeWidth(node)).toBe(DEFAULT_WIDTH);
    expect(nodeHeight(node)).toBe(DEFAULT_HEIGHT);
  });
});
