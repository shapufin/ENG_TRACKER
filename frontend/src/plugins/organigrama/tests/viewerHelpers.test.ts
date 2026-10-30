import { describe, it, expect } from "vitest";
import {
  getInitials,
  COLOR_ACCENT_CLASSES,
  SHAPE_GEOMETRY_CLASSES,
  BORDER_STYLE_CLASSES,
  nodeMatches,
  filterHierarchy,
  collectAlbanianTls,
  filterByAlbanianTl,
} from "../components/viewerHelpers";
import type { OrgChartNode, OrgChartEdge, TreeNode } from "../types";

describe("viewerHelpers getInitials", () => {
  it("extracts 2-letter initials for first and last names", () => {
    expect(getInitials("Enri Demnushi")).toBe("ED");
    expect(getInitials("Andrea Negro")).toBe("AN");
    expect(getInitials("John Michael Smith")).toBe("JS");
  });

  it("handles single-word names gracefully", () => {
    expect(getInitials("Admin")).toBe("AD");
    expect(getInitials("CEO")).toBe("CE");
    expect(getInitials("A")).toBe("A");
  });

  it("handles empty or null values with fallback", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
    expect(getInitials(null)).toBe("?");
    expect(getInitials(undefined)).toBe("?");
  });
});

describe("viewerHelpers COLOR_ACCENT_CLASSES, SHAPE_GEOMETRY_CLASSES, and BORDER_STYLE_CLASSES", () => {
  it("defines standard color accents with dark mode borders", () => {
    expect(COLOR_ACCENT_CLASSES.blue).toContain("border-blue-300");
    expect(COLOR_ACCENT_CLASSES.emerald).toContain("border-emerald-300");
    expect(COLOR_ACCENT_CLASSES.purple).toContain("border-purple-300");
    expect(COLOR_ACCENT_CLASSES.amber).toContain("border-amber-300");
    expect(COLOR_ACCENT_CLASSES.rose).toContain("border-rose-300");
    expect(COLOR_ACCENT_CLASSES.cyan).toContain("border-cyan-300");
    expect(COLOR_ACCENT_CLASSES.slate).toContain("border-slate-300");
  });

  it("defines geometric silhouette classes including pill, chamfered, sharp, soft, and leaf", () => {
    expect(SHAPE_GEOMETRY_CLASSES.rounded).toBe("rounded-lg");
    expect(SHAPE_GEOMETRY_CLASSES.pill).toBe("rounded-full px-3");
    expect(SHAPE_GEOMETRY_CLASSES.sharp).toBe("rounded-none");
    expect(SHAPE_GEOMETRY_CLASSES.soft).toBe("rounded-2xl");
    expect(SHAPE_GEOMETRY_CLASSES.leaf).toContain("rounded-tr-2xl");
    expect(SHAPE_GEOMETRY_CLASSES.chamfered).toContain("clip-path:polygon");
  });

  it("defines border styles including solid, dashed, dotted, double, and glow", () => {
    expect(BORDER_STYLE_CLASSES.solid).toBe("border-solid");
    expect(BORDER_STYLE_CLASSES.dashed).toContain("border-dashed");
    expect(BORDER_STYLE_CLASSES.dotted).toContain("border-dotted");
    expect(BORDER_STYLE_CLASSES.double).toContain("border-double");
    expect(BORDER_STYLE_CLASSES.glow).toContain("ring-primary");
  });
});

describe("viewerHelpers nodeMatches & filterHierarchy", () => {
  const nodes: OrgChartNode[] = [
    {
      node_uuid: "ceo",
      shape_type: "person",
      display_name: "Chief Executive Officer",
      role_title: "CEO",
      department_label: "Executive",
      position_x: 0,
      position_y: 0,
      width: 200,
      height: 80,
      status: "active",
    },
    {
      node_uuid: "eng_lead",
      shape_type: "person",
      display_name: "Tech Lead",
      role_title: "Staff Engineer",
      department_label: "Engineering",
      position_x: 0,
      position_y: 100,
      width: 200,
      height: 80,
      status: "active",
    },
  ];

  const edges: OrgChartEdge[] = [
    {
      edge_uuid: "e1",
      source_uuid: "ceo",
      target_uuid: "eng_lead",
      edge_type: "reports_to",
    },
  ];

  it("matches by display_name, role_title, or department_label", () => {
    expect(nodeMatches(nodes[0], "Chief")).toBe(true);
    expect(nodeMatches(nodes[0], "CEO")).toBe(true);
    expect(nodeMatches(nodes[1], "Staff")).toBe(true);
    expect(nodeMatches(nodes[1], "Engineering")).toBe(true);
    expect(nodeMatches(nodes[1], "Marketing")).toBe(false);
  });

  it("preserves ancestors when filtering hierarchy", () => {
    const { filteredNodes, visibleIds } = filterHierarchy(nodes, edges, "Staff");
    expect(filteredNodes.length).toBe(2);
    expect(visibleIds.has("ceo")).toBe(true);
    expect(visibleIds.has("eng_lead")).toBe(true);
  });
});

describe("viewerHelpers Albanian TL filter", () => {
  const person = (
    id: number,
    name: string,
    role_badge: TreeNode["role_badge"],
    children: TreeNode[] = []
  ): TreeNode => ({ type: "person", id, full_name: name, role_badge, children });
  const roots: TreeNode[] = [
    person(1, "Marco", "italian_tl", [
      person(2, "Bea", "albanian_tl", [person(20, "Ana", "employee")]),
      person(3, "Arta", "albanian_tl", [person(30, "Eni", "employee")]),
    ]),
  ];

  it("lists each Albanian TL once, sorted by name", () => {
    const twice = [...roots, person(9, "Other", "italian_tl", [person(3, "Arta", "albanian_tl")])];
    expect(collectAlbanianTls(twice)).toEqual([
      { id: 3, name: "Arta" },
      { id: 2, name: "Bea" },
    ]);
  });

  it("keeps only the path to the chosen Albanian TL", () => {
    const [root] = filterByAlbanianTl(roots, 3);
    expect(root.children.map((c) => c.id)).toEqual([3]);
    expect(root.children[0].children.map((c) => c.id)).toEqual([30]);
  });

  it("drops an Italian TL with no chosen branch", () => {
    expect(filterByAlbanianTl(roots, 99)).toEqual([]);
  });
});
