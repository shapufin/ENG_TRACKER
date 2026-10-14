import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import { useBuilderHistory } from "../hooks/useBuilderHistory";

describe("useBuilderHistory", () => {
  it("tracks state snapshots and handles undo/redo", () => {
    const initialNodes: Node[] = [
      { id: "1", type: "builderNode", position: { x: 0, y: 0 }, data: {} },
    ];
    const initialEdges: Edge[] = [];

    const { result } = renderHook(() => {
      const [nodes, setNodes] = useState<Node[]>(initialNodes);
      const [edges, setEdges] = useState<Edge[]>(initialEdges);
      const history = useBuilderHistory(nodes, edges, setNodes, setEdges);
      return { nodes, edges, setNodes, setEdges, ...history };
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    // Record a state change
    act(() => {
      result.current.recordSnapshot(result.current.nodes, result.current.edges);
      result.current.setNodes([
        ...result.current.nodes,
        { id: "2", type: "builderNode", position: { x: 50, y: 50 }, data: {} },
      ]);
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.nodes.length).toBe(1);
    expect(result.current.nodes[0].id).toBe("1");
    expect(result.current.canRedo).toBe(true);

    // Redo
    act(() => {
      result.current.redo();
    });

    expect(result.current.nodes.length).toBe(2);
    expect(result.current.canUndo).toBe(true);
  });
});
