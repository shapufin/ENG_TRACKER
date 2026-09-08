/** Tests for OrgChartMobileList component. */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { OrgChartMobileList } from "../components/OrgChartMobileList";
import type { TreeNode } from "../types";

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
          {
            type: "person",
            id: 21,
            username: "emp2",
            full_name: "Kejvi Bushaj",
            role_badge: "employee",
            children: [],
          },
        ],
      },
    ],
  },
];

describe("OrgChartMobileList", () => {
  it("renders all visible nodes in the tree", () => {
    render(<OrgChartMobileList roots={mockTree} />);

    expect(screen.getByText("Andrea Negro")).toBeInTheDocument();
    expect(screen.getByText("Enri Demnushi")).toBeInTheDocument();
    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    expect(screen.getByText("Aldair Xhelili")).toBeInTheDocument();
    expect(screen.getByText("Kejvi Bushaj")).toBeInTheDocument();
  });

  it("renders team code as subtitle", () => {
    render(<OrgChartMobileList roots={mockTree} />);
    expect(screen.getByText("INFRA")).toBeInTheDocument();
  });

  it("renders role badges with aria-label", () => {
    render(<OrgChartMobileList roots={mockTree} />);
    expect(screen.getByText("IT TL")).toBeInTheDocument();
    expect(screen.getByText("AL TL")).toBeInTheDocument();
  });

  it("renders empty state when no roots", () => {
    render(<OrgChartMobileList roots={[]} />);
    expect(screen.getByText("No organizational data available.")).toBeInTheDocument();
  });

  it("uses semantic tree/list markup", () => {
    const { container } = render(<OrgChartMobileList roots={mockTree} />);
    expect(container.querySelector('ul[role="tree"]')).toBeInTheDocument();
    expect(container.querySelectorAll('li[role="treeitem"]').length).toBeGreaterThan(0);
  });

  it("collapses and expands nodes on button click", () => {
    render(<OrgChartMobileList roots={mockTree} />);

    // Enri Demnushi should be visible initially (depth 1 < 2, expanded by default)
    expect(screen.getByText("Enri Demnushi")).toBeInTheDocument();

    // Find the expand/collapse button for Andrea Negro (root, depth 0)
    const andreaRow = screen.getByText("Andrea Negro").closest("li");
    expect(andreaRow).toBeTruthy();
    const collapseBtn = andreaRow?.querySelector("button[aria-label='Collapse']");
    expect(collapseBtn).toBeTruthy();

    // Collapse Andrea's children
    if (collapseBtn) {
      fireEvent.click(collapseBtn);
    }

    // Enri Demnushi should now be hidden
    expect(screen.queryByText("Enri Demnushi")).not.toBeInTheDocument();

    // Expand again
    const expandBtn = andreaRow?.querySelector("button[aria-label='Expand']");
    if (expandBtn) {
      fireEvent.click(expandBtn);
    }

    // Enri should be visible again
    expect(screen.getByText("Enri Demnushi")).toBeInTheDocument();
  });

  it("sets aria-level on tree items", () => {
    const { container } = render(<OrgChartMobileList roots={mockTree} />);
    const items = container.querySelectorAll('li[role="treeitem"]');
    expect(items.length).toBeGreaterThan(0);
    // Root should have aria-level=1
    const rootItem = items[0];
    expect(rootItem.getAttribute("aria-level")).toBe("1");
  });
});
