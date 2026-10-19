import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamDataTable } from "./TeamDataTable";
import type { TeamNode } from "@/lib/teamTree";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const node = (over: Partial<TeamNode>): TeamNode =>
  ({
    id: 1,
    name: "Alpha",
    code: "A",
    description: "",
    parent_team: null,
    team_leader: null,
    italian_tl: { id: 7, username: "it", first_name: "Ida", last_name: "Rossi" },
    albanian_tl: null,
    calendar_group: "",
    created_at: "",
    updated_at: "",
    depth: 0,
    children: [],
    ...over,
  }) as TeamNode;

const renderTable = (data: TeamNode[]) => {
  localStorage.clear();
  return render(
    <TeamDataTable
      data={data}
      expanded={new Set()}
      onToggleExpand={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      hoveredPath={new Set()}
      onRowMouseEnter={vi.fn()}
      onRowMouseLeave={vi.fn()}
    />
  );
};

describe("TeamDataTable", () => {
  it("shows the derived IT and AL leaders in their own columns", () => {
    renderTable([node({})]);
    expect(screen.getByRole("columnheader", { name: /^IT TL/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /^AL TL/ })).toBeInTheDocument();
    expect(screen.getByText("Ida Rossi")).toBeInTheDocument();
  });

  it("hides the Description column while no team has a description, so the table fits", () => {
    renderTable([node({}), node({ id: 2, name: "Beta" })]);
    expect(screen.queryByRole("columnheader", { name: /description/i })).toBeNull();
  });

  it("shows the Description column once any team has one", () => {
    renderTable([node({ description: "Managed NOC" }), node({ id: 2, name: "Beta" })]);
    expect(screen.getByRole("columnheader", { name: /description/i })).toBeInTheDocument();
    expect(screen.getByText("Managed NOC")).toBeInTheDocument();
  });
});
