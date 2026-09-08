/** Regression tests for OrgChartPage edge geometry (Phase A — straight/orthogonal connectors). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type { TreeNode } from "../types";

// Capture the props passed to the mocked ReactFlow component so we can assert
// on the edge type that the viewer will actually render.
const captured = vi.hoisted(() => ({
  edges: [] as Array<{ type?: string }>,
  nodes: [] as Array<{ id: string }>,
  defaultEdgeOptions: null as { type?: string } | null,
}));

vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: {
    nodes: Array<{ id: string }>;
    edges: Array<{ type?: string }>;
    defaultEdgeOptions?: { type?: string };
  }) => {
    captured.nodes = props.nodes ?? [];
    captured.edges = props.edges ?? [];
    captured.defaultEdgeOptions = props.defaultEdgeOptions ?? null;
    return React.createElement("div", { "data-testid": "react-flow-mock" });
  },
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Background: () => null,
  Controls: () => null,
  useReactFlow: () => ({
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitView: vi.fn(),
  }),
}));

// OrgChartToolbar pulls in shadcn primitives; stub it to keep the test focused
// on edge geometry rather than toolbar rendering.
vi.mock("../components/OrgChartToolbar", () => ({
  OrgChartToolbar: (props: { onSearchChange?: (value: string) => void }) =>
    React.createElement("input", {
      "aria-label": "Search",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        props.onSearchChange?.(event.target.value),
    }),
}));

import { OrgChartPage } from "../components/OrgChartPage";

const mockTree: TreeNode[] = [
  {
    type: "person",
    id: 1,
    username: "it_tl",
    full_name: "Andrea Negro",
    role_badge: "italian_tl",
    children: [
      {
        type: "person",
        id: 2,
        username: "al_tl",
        full_name: "Enri Demnushi",
        role_badge: "albanian_tl",
        children: [
          {
            type: "tech",
            id: 10,
            name: "Infrastructure",
            code: "INFRA",
            children: [
              {
                type: "person",
                id: 20,
                username: "emp1",
                full_name: "Aldair Xhelili",
                role_badge: "employee",
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
];

describe("OrgChartPage edge geometry (Phase A)", () => {
  beforeEach(() => {
    captured.nodes = [];
    captured.edges = [];
    captured.defaultEdgeOptions = null;
  });

  it("renders every hierarchy edge with the orthogonal 'step' type", () => {
    render(React.createElement(OrgChartPage, { roots: mockTree }));

    // A 4-node chain produces 3 parent->child edges.
    expect(captured.edges.length).toBe(3);
    for (const edge of captured.edges) {
      expect(edge.type).toBe("step");
    }
  });

  it("uses 'step' as the default edge type", () => {
    render(React.createElement(OrgChartPage, { roots: mockTree }));
    expect(captured.defaultEdgeOptions?.type).toBe("step");
  });

  it("does not use the legacy 'smoothstep' connector on any edge", () => {
    render(React.createElement(OrgChartPage, { roots: mockTree }));
    const smoothstepEdges = captured.edges.filter((e) => e.type === "smoothstep");
    expect(smoothstepEdges).toHaveLength(0);
    expect(captured.defaultEdgeOptions?.type).not.toBe("smoothstep");
  });

  it("prunes unrelated descendants when a parent matches search", () => {
    render(React.createElement(OrgChartPage, { roots: mockTree }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Andrea" } });
    expect(captured.nodes.map((node) => node.id)).toEqual(["person-1"]);
  });
});
