/** Tests for the read-only custom chart viewer. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomChartViewer } from "../components/CustomChartViewer";
import { filterHierarchy } from "../components/viewerHelpers";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { OrgChart, DraftPayload, OrgChartNode, OrgChartEdge } from "../types";

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(),
}));

const mockChart: OrgChart = {
  id: 1,
  name: "Q3 Structure",
  slug: "q3-structure",
  status: "published",
  source_mode: "custom",
  node_count: 2,
  revision_number: 1,
  is_featured: false,
  description: "",
  audience_mode: "all_authenticated",
  audience_role_codes: [],
  audience_group_ids: [],
  published_revision: 1,
  published_at: "2026-08-17T00:00:00Z",
  published_by_name: "Admin",
  created_by: 1,
  created_by_name: "Admin",
  updated_by: 1,
  updated_by_name: "Admin",
  created_at: "2026-08-17T00:00:00Z",
  updated_at: "2026-08-17T00:00:00Z",
};

const mockPayload: DraftPayload = {
  revision_number: 1,
  nodes: [
    {
      node_uuid: "n1",
      shape_type: "person",
      display_name: "CEO",
      role_title: "Chief Executive",
      position_x: 0,
      position_y: 0,
      width: 180,
      height: 80,
      sort_order: 0,
      status: "active",
    },
    {
      node_uuid: "n2",
      shape_type: "team",
      display_name: "Engineering",
      position_x: 0,
      position_y: 120,
      width: 180,
      height: 80,
      sort_order: 1,
      status: "active",
    },
  ],
  edges: [
    {
      edge_uuid: "e1",
      source_uuid: "n1",
      target_uuid: "n2",
      edge_type: "reports_to",
    },
  ],
};

describe("CustomChartViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a semantic mobile tree with expand/collapse buttons", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    render(<CustomChartViewer chart={mockChart} payload={mockPayload} />);

    expect(screen.getByRole("tree")).toBeInTheDocument();
    expect(screen.getByText("CEO")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getAllByText("active")).toHaveLength(2);

    // The node with children should have an expand/collapse control.
    expect(screen.getByLabelText("Collapse")).toBeInTheDocument();
  });

  it("nests visual group members in the published mobile viewer", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const payload: DraftPayload = {
      revision_number: 1,
      nodes: [
        {
          node_uuid: "group",
          shape_type: "section",
          display_name: "Engineering Group",
          position_x: 100,
          position_y: 100,
          width: 400,
          height: 240,
          status: "active",
        },
        {
          node_uuid: "member",
          shape_type: "person",
          display_name: "Grouped Person",
          group_uuid: "group",
          position_x: 40,
          position_y: 60,
          width: 180,
          height: 80,
          status: "active",
        },
      ],
      edges: [],
    };
    render(<CustomChartViewer chart={mockChart} payload={payload} />);

    expect(screen.getByText("Grouped Person").closest('[role="treeitem"]')).toHaveAttribute(
      "aria-level",
      "2"
    );
  });

  it("renders an empty state when the payload has no roots", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    render(
      <CustomChartViewer chart={mockChart} payload={{ revision_number: 0, nodes: [], edges: [] }} />
    );

    expect(screen.getByText(/No chart data available/i)).toBeInTheDocument();
  });

  it("renders a search input on mobile", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    render(<CustomChartViewer chart={mockChart} payload={mockPayload} />);

    expect(screen.getByLabelText("Search chart")).toBeInTheDocument();
  });

  it("filters mobile list by search query", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    render(<CustomChartViewer chart={mockChart} payload={mockPayload} />);

    const searchInput = screen.getByLabelText("Search chart");
    fireEvent.change(searchInput, { target: { value: "Engineering" } });

    expect(screen.getByText("Engineering")).toBeInTheDocument();
    // CEO is an ancestor of Engineering, so it should still be visible
    expect(screen.getByText("CEO")).toBeInTheDocument();
  });

  it("shows no-match message when search has no results on mobile", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    render(<CustomChartViewer chart={mockChart} payload={mockPayload} />);

    const searchInput = screen.getByLabelText("Search chart");
    fireEvent.change(searchInput, { target: { value: "Nonexistent" } });

    expect(screen.getByText(/No matching nodes found/i)).toBeInTheDocument();
  });

  it("hides non-matching children of a matching parent on mobile", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    // CEO (root) -> Engineering (matches) -> Alice (should be hidden)
    const payload: DraftPayload = {
      revision_number: 1,
      nodes: [
        {
          node_uuid: "ceo",
          shape_type: "person",
          display_name: "CEO",
          position_x: 0,
          position_y: 0,
          width: 180,
          height: 80,
          sort_order: 0,
          status: "active",
        },
        {
          node_uuid: "eng",
          shape_type: "team",
          display_name: "Engineering",
          position_x: 0,
          position_y: 100,
          width: 180,
          height: 80,
          sort_order: 1,
          status: "active",
        },
        {
          node_uuid: "alice",
          shape_type: "person",
          display_name: "Alice",
          position_x: 0,
          position_y: 200,
          width: 180,
          height: 80,
          sort_order: 2,
          status: "active",
        },
      ],
      edges: [
        { edge_uuid: "e1", source_uuid: "ceo", target_uuid: "eng", edge_type: "reports_to" },
        { edge_uuid: "e2", source_uuid: "eng", target_uuid: "alice", edge_type: "reports_to" },
      ],
    };
    render(<CustomChartViewer chart={mockChart} payload={payload} />);

    const searchInput = screen.getByLabelText("Search chart");
    fireEvent.change(searchInput, { target: { value: "Engineering" } });

    // Ancestors of the match stay visible.
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("CEO")).toBeInTheDocument();
    // Non-matching descendants of the match must be hidden.
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });
});

describe("filterHierarchy", () => {
  const nodes: OrgChartNode[] = [
    {
      node_uuid: "root",
      shape_type: "person",
      display_name: "CEO",
      role_title: "Chief",
      position_x: 0,
      position_y: 0,
      width: 180,
      height: 80,
      sort_order: 0,
      status: "active",
    },
    {
      node_uuid: "mgr",
      shape_type: "person",
      display_name: "Manager",
      role_title: "Engineering Manager",
      position_x: 0,
      position_y: 100,
      width: 180,
      height: 80,
      sort_order: 1,
      status: "active",
    },
    {
      node_uuid: "emp",
      shape_type: "person",
      display_name: "Alice",
      role_title: "Developer",
      position_x: 0,
      position_y: 200,
      width: 180,
      height: 80,
      sort_order: 2,
      status: "active",
    },
  ];
  const edges: OrgChartEdge[] = [
    { edge_uuid: "e1", source_uuid: "root", target_uuid: "mgr", edge_type: "reports_to" },
    { edge_uuid: "e2", source_uuid: "mgr", target_uuid: "emp", edge_type: "reports_to" },
  ];

  it("returns all nodes when query is empty", () => {
    const { filteredNodes, visibleIds } = filterHierarchy(nodes, edges, "");
    expect(filteredNodes).toHaveLength(3);
    expect(visibleIds.size).toBe(3);
  });

  it("filters to matching node + ancestors", () => {
    const { filteredNodes, visibleIds } = filterHierarchy(nodes, edges, "Alice");
    expect(filteredNodes).toHaveLength(3); // Alice + Manager (parent) + CEO (grandparent)
    expect(visibleIds.has("emp")).toBe(true);
    expect(visibleIds.has("mgr")).toBe(true);
    expect(visibleIds.has("root")).toBe(true);
  });

  it("filters by role_title", () => {
    const { filteredNodes } = filterHierarchy(nodes, edges, "Engineering Manager");
    expect(filteredNodes).toHaveLength(2); // Manager + CEO (ancestor)
    expect(filteredNodes.some((n) => n.node_uuid === "mgr")).toBe(true);
    expect(filteredNodes.some((n) => n.node_uuid === "root")).toBe(true);
  });

  it("returns empty when no match", () => {
    const { filteredNodes, visibleIds } = filterHierarchy(nodes, edges, "Nonexistent");
    expect(filteredNodes).toHaveLength(0);
    expect(visibleIds.size).toBe(0);
  });
});
