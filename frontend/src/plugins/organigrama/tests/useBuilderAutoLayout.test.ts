import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import {
  calculateHierarchyLayout,
  calculateChildSpawnPosition,
} from "../hooks/useBuilderAutoLayout";

describe("useBuilderAutoLayout", () => {
  it("positions parent and children hierarchically without overlapping", () => {
    const nodes: Node[] = [
      {
        id: "root",
        type: "builderNode",
        position: { x: 0, y: 0 },
        width: 200,
        height: 80,
        data: { shape_type: "person", display_name: "CEO" },
      },
      {
        id: "child1",
        type: "builderNode",
        position: { x: 0, y: 0 },
        width: 200,
        height: 80,
        data: { shape_type: "person", display_name: "CTO" },
      },
      {
        id: "child2",
        type: "builderNode",
        position: { x: 0, y: 0 },
        width: 200,
        height: 80,
        data: { shape_type: "person", display_name: "CFO" },
      },
    ];

    const edges: Edge[] = [
      { id: "e1", source: "root", target: "child1" },
      { id: "e2", source: "root", target: "child2" },
    ];

    const layouted = calculateHierarchyLayout(nodes, edges, { direction: "TB" });

    const rootNode = layouted.find((n) => n.id === "root")!;
    const c1 = layouted.find((n) => n.id === "child1")!;
    const c2 = layouted.find((n) => n.id === "child2")!;

    // Children must be positioned vertically below the root
    expect(c1.position.y).toBeGreaterThan(rootNode.position.y);
    expect(c2.position.y).toBeGreaterThan(rootNode.position.y);

    // The two sibling children must not overlap on X
    expect(c1.position.x).not.toBe(c2.position.x);
  });

  it("calculates child spawn position with horizontal offsets", () => {
    const parentNode: Node = {
      id: "parent",
      type: "builderNode",
      position: { x: 100, y: 200 },
      width: 200,
      height: 80,
      data: { shape_type: "person", display_name: "Manager" },
    };

    const firstPos = calculateChildSpawnPosition(parentNode, 1, 200);
    const secondPos = calculateChildSpawnPosition(parentNode, 2, 200);

    expect(firstPos.y).toBe(200 + 80 + 80);
    expect(secondPos.x).toBeGreaterThan(firstPos.x);
  });
});
