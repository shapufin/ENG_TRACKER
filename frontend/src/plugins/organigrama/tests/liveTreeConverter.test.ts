import { describe, it, expect } from "vitest";
import { convertLiveTreeToGraph } from "../services/liveTreeConverter";
import type { TreeNode } from "../types";

describe("liveTreeConverter", () => {
  it("converts recursive TreeNode tree into flat builder nodes and edges", () => {
    const mockTreeRoots: TreeNode[] = [
      {
        type: "person",
        id: 10,
        full_name: "Manager One",
        role_badge: "italian_tl",
        children: [
          {
            type: "person",
            id: 20,
            full_name: "Employee Two",
            role_badge: "employee",
            tech_levels: ["Infrastructure L2"],
            children: [],
          },
        ],
      },
    ];

    const { nodes, edges } = convertLiveTreeToGraph(mockTreeRoots);

    expect(nodes.length).toBe(2);
    expect(edges.length).toBe(1);

    const rootNode = nodes.find((n) => n.data.display_name === "Manager One");
    const childNode = nodes.find((n) => n.data.display_name === "Employee Two");

    expect(rootNode).toBeDefined();
    expect(childNode).toBeDefined();

    expect(rootNode?.data.role_title).toBe("ITALIAN TL");
    expect(childNode?.data.department_label).toBe("Infrastructure L2");

    expect(edges[0].source).toBe(rootNode?.id);
    expect(edges[0].target).toBe(childNode?.id);
    expect(edges[0].data?.edge_type).toBe("reports_to");
  });
});
